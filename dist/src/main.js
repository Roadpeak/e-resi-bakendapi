"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const swagger_1 = require("@nestjs/swagger");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const response_interceptor_1 = require("./common/interceptors/response.interceptor");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { logger: ['log', 'warn', 'error'] });
    const config = app.get(config_1.ConfigService);
    app.use((0, helmet_1.default)());
    app.use((0, cookie_parser_1.default)());
    const rawOrigin = config.get('FRONTEND_URL', 'http://localhost:3000');
    const allowedOrigins = rawOrigin.split(',').map((o) => o.trim());
    const devOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
    const origins = Array.from(new Set([...allowedOrigins, ...devOrigins]));
    app.enableCors({
        origin: origins,
        credentials: true,
    });
    const prefix = config.get('API_PREFIX', 'api');
    app.setGlobalPrefix(prefix);
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new http_exception_filter_1.AllExceptionsFilter());
    app.useGlobalInterceptors(new response_interceptor_1.ResponseInterceptor());
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('e-resi API')
        .setDescription('e-resi Immersive Real Estate Platform — REST API')
        .setVersion('1.0')
        .addBearerAuth()
        .addServer(`http://localhost:${config.get('PORT', 4000)}`)
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
    swagger_1.SwaggerModule.setup(`${prefix}/docs`, app, document, {
        swaggerOptions: { persistAuthorization: true },
    });
    const port = config.get('PORT', 4000);
    await app.listen(port);
    console.log(`\n🚀 e-resi API running at http://localhost:${port}/${prefix}`);
    console.log(`📖 Swagger docs at http://localhost:${port}/${prefix}/docs\n`);
}
bootstrap();
//# sourceMappingURL=main.js.map