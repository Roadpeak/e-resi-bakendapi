import { Injectable, Logger } from '@nestjs/common';
import { AmenityType } from '@prisma/client';

/**
 * Suggests nearby landmarks around a development's coordinates, so developers
 * don't have to type them by hand.
 *
 * Runs server-side deliberately. Nominatim's usage policy caps callers at one
 * request per second and forbids heavy use; that is only enforceable from one
 * place, and a browser-side implementation would issue a burst per developer
 * with no shared throttle and no way to set a contact User-Agent.
 *
 * These are suggestions, not truth: OSM returns unnamed and junk entries (a
 * search around Nairobi returns a place literally named "School"), so nothing
 * here is written to the database. The developer confirms what to keep.
 */

interface NominatimPlace {
  name?: string;
  display_name?: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
}

export interface NearbySuggestion {
  name: string;
  type: AmenityType;
  /** Formatted for display, e.g. "0.5 km" — the listing prints it verbatim. */
  distance: string;
  /** Straight-line metres, so callers can sort or re-filter. */
  distanceMetres: number;
  latitude: number;
  longitude: number;
}

/** What to search for, and which AmenityType each result becomes. */
const SEARCH_CATEGORIES: { query: string; type: AmenityType }[] = [
  { query: 'school', type: AmenityType.SCHOOL },
  { query: 'hospital', type: AmenityType.HOSPITAL },
  { query: 'shopping mall', type: AmenityType.MALL },
  { query: 'supermarket', type: AmenityType.SUPERMARKET },
  { query: 'bank', type: AmenityType.BANK },
  { query: 'park', type: AmenityType.PARK },
];

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** Metres between two coordinates, great-circle. */
function haversineMetres(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Straight-line distance, phrased the way developers write it. Deliberately
 * not presented as travel distance — the road route is always longer, and the
 * listing shows this string as-is.
 */
function formatDistance(metres: number): string {
  if (metres < 950) return `${Math.round(metres / 50) * 50} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** A degree of latitude is ~111km; longitude shrinks with latitude. */
function boundingBox(lat: number, lng: number, radiusMetres: number) {
  const dLat = radiusMetres / 111_320;
  const dLng = radiusMetres / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  // Nominatim's viewbox order is left,top,right,bottom.
  return [lng - dLng, lat + dLat, lng + dLng, lat - dLat].map((n) => n.toFixed(6)).join(',');
}

@Injectable()
export class NearbyPlacesService {
  private readonly logger = new Logger(NearbyPlacesService.name);

  /**
   * Nominatim asks for a genuine contact address in the User-Agent so they can
   * reach whoever is generating traffic. Configurable so deployments identify
   * themselves rather than all claiming to be the same client.
   */
  private get userAgent(): string {
    const contact = process.env.NOMINATIM_CONTACT ?? 'support@e-resi.com';
    return `e-resi/1.0 (${contact})`;
  }

  private async searchOne(
    query: string,
    lat: number,
    lng: number,
    radiusMetres: number,
  ): Promise<NominatimPlace[]> {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      viewbox: boundingBox(lat, lng, radiusMetres),
      bounded: '1',
      // Nominatim caps at 40. Asking for more than we show on purpose: the
      // box is a rectangle, so corner results get dropped by the radius
      // filter below, and a low limit starves categories at wide radii.
      limit: '25',
    });
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`nominatim returned ${res.status}`);
    return (await res.json()) as NominatimPlace[];
  }

  /**
   * Suggest landmarks within `radiusMetres` of a point.
   *
   * Categories are searched in sequence with a pause between them to stay
   * inside Nominatim's one-request-per-second limit — parallel requests would
   * breach the policy and risk the whole platform being blocked. That makes
   * this a few seconds per call, which is why it is a developer-triggered
   * action rather than something that runs on page load.
   */
  async suggest(
    latitude: number,
    longitude: number,
    radiusMetres = 3000,
  ): Promise<NearbySuggestion[]> {
    const found: NearbySuggestion[] = [];
    const seen = new Set<string>();

    for (const [i, category] of SEARCH_CATEGORIES.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1100));
      try {
        const places = await this.searchOne(category.query, latitude, longitude, radiusMetres);
        for (const place of places) {
          const name = (place.name ?? '').trim();
          // Unnamed entries, and entries named after the category itself
          // ("School", "Bank"), are noise rather than landmarks.
          if (!name || name.toLowerCase() === category.query.toLowerCase()) continue;

          const plat = Number.parseFloat(place.lat);
          const plng = Number.parseFloat(place.lon);
          if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;

          const metres = haversineMetres(latitude, longitude, plat, plng);
          // bounded=1 uses a rectangle, so corners exceed the radius.
          if (metres > radiusMetres) continue;

          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          found.push({
            name,
            type: category.type,
            distance: formatDistance(metres),
            distanceMetres: Math.round(metres),
            latitude: plat,
            longitude: plng,
          });
        }
      } catch (err) {
        // One category failing must not lose the others — the public
        // Nominatim endpoint rate-limits and occasionally refuses outright.
        this.logger.warn(
          `Nearby lookup for "${category.query}" failed: ${(err as Error).message}`,
        );
      }
    }

    return found.sort((a, b) => a.distanceMetres - b.distanceMetres);
  }
}
