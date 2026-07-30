"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUnitDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_unit_dto_js_1 = require("./create-unit.dto.js");
class UpdateUnitDto extends (0, swagger_1.PartialType)(create_unit_dto_js_1.CreateUnitDto) {
}
exports.UpdateUnitDto = UpdateUnitDto;
//# sourceMappingURL=update-unit.dto.js.map