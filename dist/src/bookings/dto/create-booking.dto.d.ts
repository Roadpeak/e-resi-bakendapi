import { BookingType } from '@prisma/client';
export declare class CreateBookingDto {
    propertySlug: string;
    name: string;
    email: string;
    phone?: string;
    date: string;
    time: string;
    type: BookingType;
    message?: string;
}
