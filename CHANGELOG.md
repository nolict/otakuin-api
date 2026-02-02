# Changelog

## [0.1.0](https://github.com/nolict/otakuin-api/compare/otakuin-v0.0.1...otakuin-v0.1.0) (2026-02-02)


### Features

* **api:** add /api/streaming/:id/:episode endpoint with cached video sources from Animasu and Samehadaku ([7a283cc](https://github.com/nolict/otakuin-api/commit/7a283ccd1c3087fb75d402162c99d661b3fd65f0))
* **api:** add multi-source anime endpoint with advanced 4-layer matching algorithm (Jikan API + Samehadaku + Animasu) ([4e9b678](https://github.com/nolict/otakuin-api/commit/4e9b678c1bf6e570615fadd2f338ef8c3356d938))
* **deploy:** add Vercel serverless deployment configuration with environment setup and comprehensive deployment guide ([3d09cc6](https://github.com/nolict/otakuin-api/commit/3d09cc66dbbb2bf4033593f1b6c88b88a1e419be))
* **deploy:** migrate from Vercel to Fly.io with Docker and Bun runtime ([b047593](https://github.com/nolict/otakuin-api/commit/b047593f4bbcb6a33e82dbf839702ddf1e11aa5c))
* **perf:** add supabase caching, parallel scraping optimization, and professional logging system with performance timing ([a714465](https://github.com/nolict/otakuin-api/commit/a7144656f4e33056f23fb083981b205fa60f87a6))
* **streaming:** add blogger video extraction, proxy system with CORS support, and integration docs ([3d172e3](https://github.com/nolict/otakuin-api/commit/3d172e302939cfb08ecfd1d93de8867af9c61bb1))


### Bug Fixes

* **api:** add proper error handling and logging for scraping failures in Vercel handler ([f82af72](https://github.com/nolict/otakuin-api/commit/f82af7261ea8b5b2b8b1fde4b7358855ce8a0c8c))
* **deploy:** add .js extension to all relative imports for ESM compatibility in Vercel ([8338ea3](https://github.com/nolict/otakuin-api/commit/8338ea33cf37a79c058ab7ee584337871b0480ac))
* **deploy:** add .js extension to dynamic imports for Vercel compiled output ([fbc484f](https://github.com/nolict/otakuin-api/commit/fbc484ff03ad265de9e14ad57e05b8671547a8d1))
* **deploy:** convert Elysia app.fetch to proper Vercel serverless handler with request/response adapter ([1fbc973](https://github.com/nolict/otakuin-api/commit/1fbc9737c45a1694bdfead1d38701dcdb2d79a27))
* **deploy:** convert URL object to string in Request constructor ([42981f2](https://github.com/nolict/otakuin-api/commit/42981f272e36f603bae20c2d724ef595d4027f31))
* **deploy:** correct import function name scrapeHomePage in home endpoint handler ([6b3e6a2](https://github.com/nolict/otakuin-api/commit/6b3e6a2ed27cc20ba925ec8996c90d8ce10595f7))
* **deploy:** replace Elysia framework with pure Node.js handler for Vercel compatibility ([e2c0461](https://github.com/nolict/otakuin-api/commit/e2c04610eae4ff36ae9fa371a3795e610f537ab8))
* **deploy:** simplify Vercel configuration - remove unnecessary build commands, let Vercel auto-detect dependencies ([d5bf492](https://github.com/nolict/otakuin-api/commit/d5bf492643b43379087538f0bb00d105dfc7efd8))
* **scraper:** add browser-like headers to bypass 403 Forbidden from anime websites ([3034f2f](https://github.com/nolict/otakuin-api/commit/3034f2f33f5e860e62ad5786cab6fdd47f0132de))
* **types:** resolve remaining TypeScript errors for logger.warn signature and Cheerio types ([513139d](https://github.com/nolict/otakuin-api/commit/513139d6893f562295421ca744b10a75e3e6daf7))
* **types:** resolve TypeScript compilation errors for Vercel deployment ([b300e4b](https://github.com/nolict/otakuin-api/commit/b300e4bf5d66fa26b822727430486f8569297c2e))
* **vercel:** fix env settings ([b8664e8](https://github.com/nolict/otakuin-api/commit/b8664e8e9a37c4f7a06b57858a0599c35cdcbbc7))


### Refactors

* **core:** reorganize services into SOLID structure, implement fuzzy slug matching with 5-pattern generator ([127c6b9](https://github.com/nolict/otakuin-api/commit/127c6b99b5fcea3d91d96b4866040b9ff837b0a7))
* **deploy:** remove Fly.io/Vercel, restore pure ElysiaJS for VPS deployment ([d38aa13](https://github.com/nolict/otakuin-api/commit/d38aa13873047f8d83e0039f9915897feb5b6071))
