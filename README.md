# OpenAPI TypeScript Codegen

Fork of [ferdikoomen/openapi-typescript-codegen](https://github.com/ferdikoomen/openapi-typescript-codegen). See that repository for more documentation.

## List of changes
1. Headers are always optional, whether the OpenAPI JSON says they are required or not.
2. Added an optional config property called `ERROR_CALLBACK` which is a function that will run before API errors are thrown.
3. Ability to run code before or after each request using `BEFORE_REQUEST` and `BEFORE_REQUEST` config

## Testing
1. Run `npm test` to run automated tests
2. If a snapshot test fails due to an intentional change, run `npm run test:update` to update the snapshots
3. To test local changes with your application, first run `npm run build`. Then, replace `npx @jegan321/openapi-typescript-codegen` with `node ../openapi-typescript-codegen/bin/index.js` in your application-side script.

## Release
1. Update package.json with a new version
2. `npm run release`
3. `npm publish`
4. Commit changes
