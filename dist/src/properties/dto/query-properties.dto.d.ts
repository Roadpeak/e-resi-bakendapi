import { PropertyCategory, PropertyStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto.js';
export declare class QueryPropertiesDto extends PaginationDto {
    status?: PropertyStatus;
    category?: PropertyCategory;
    city?: string;
    neighborhood?: string;
    q?: string;
}
