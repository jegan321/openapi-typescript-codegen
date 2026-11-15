# OpenAPI TypeScript Codegen

Fork of [ferdikoomen/openapi-typescript-codegen](https://github.com/ferdikoomen/openapi-typescript-codegen). See that repository for more documentation.

## List of changes
1. Headers are always optional, whether the OpenAPI JSON says they are required or not.
2. Added an optional config property called `ERROR_CALLBACK` which is a function that will run before API errors are thrown.
3. Ability to run code before or after each request using `BEFORE_REQUEST` and `BEFORE_REQUEST` config.
4. Added `--modelsImportPath` to configure service model imports. Combine with `--exportModels false` to share models across clients.
5. The Fetch client accepts synchronous or asynchronous `BEFORE_REQUEST` hooks (`void | Promise<void>`) and waits for them to complete before preparing and sending the request. If the hook throws or rejects, the request rejects without being sent.

## Testing
1. Run `npm test` to run automated tests
2. If a snapshot test fails due to an intentional change, run `npm run test:update` to update the snapshots
3. To test local changes with your application, first run `npm run build`. Then, replace `npx @jegan321/openapi-typescript-codegen` with `node ../openapi-typescript-codegen/bin/index.js` in your application-side script.

## Release
1. Update package.json with a new version
2. `npm run release`
3. `npm publish`
4. Commit changes

### Fetch runtime extensions

Generated fetch `OpenAPIConfig` accepts these optional settings (other transports do not):

- `ON_REQUEST(promise, options)`: observes the actual returned `CancelablePromise`, synchronously before return. Return a synchronous cleanup function to run once on fulfillment, rejection, or cancellation. Observer/cleanup exceptions are ignored. Cleanup runs in a promise microtask; use both settlement branches rather than an ignored `finally()` to avoid unhandled rejections.
- `ON_RESPONSE(response, options)`: called as soon as fetch returns any HTTP response, including 4xx/5xx, before reading its body. Do not consume the body in this hook.
- `ON_TRANSPORT_ERROR(error, options)`: observes fetch rejection only, excluding intentional cancellation. Setup, BEFORE_REQUEST, parsing, HTTP errors, and other hook failures are excluded.
- `TRANSFORM_TRANSPORT_ERROR(error, options)`: returns the rejection value to use after transport observation. Without it the original value is preserved, including non-Error values.
- `QUERY_SERIALIZER(query)`: returns the entire query suffix, including `?` (or an empty string). Default serialization continues to use bracket notation.

All hooks are synchronous except the existing awaited `BEFORE_REQUEST`. Response and transport hook exceptions reject the request; they should not throw unless that is intended. Lifecycle callbacks and cleanup must be synchronous. Existing `AFTER_REQUEST` and `ERROR_CALLBACK` behavior is unchanged. No generated service signature changes are needed.

Example application-owned mobile setup (imports and network policy belong in the app):

```ts
import { OpenAPI } from './api-clients/core/OpenAPI';
import type { CancelablePromise } from './api-clients/core/CancelablePromise';
import { reportNetworkSuccess, reportNetworkFailure } from './services/network-service';
import { NetworkError } from './errors/network-error';

export const pendingRequests = new Set<CancelablePromise<any>>();
OpenAPI.ON_REQUEST = promise => {
    pendingRequests.add(promise);
    return () => { pendingRequests.delete(promise); };
};
OpenAPI.ON_RESPONSE = () => { reportNetworkSuccess(); };
OpenAPI.ON_TRANSPORT_ERROR = () => { reportNetworkFailure(); };
OpenAPI.TRANSFORM_TRANSPORT_ERROR = error => new NetworkError(error);
OpenAPI.QUERY_SERIALIZER = query => {
    const pairs: string[] = [];
    const visit = (key: string, value: any) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) value.forEach(item => visit(key, item));
        else if (typeof value === 'object') {
            Object.entries(value).forEach(([field, item]) => visit(`${key}_${field}`, item));
        } else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    };
    Object.entries(query).forEach(([key, value]) => visit(key, value));
    return pairs.length ? `?${pairs.join('&')}` : '';
};
export function cancelPendingRequests() {
    for (const promise of pendingRequests) promise.cancel();
    pendingRequests.clear();
}
```

Adapt the `NetworkError` constructor to the app's accepted input type. Apps that classify only some fetch rejections as connectivity failures can apply their predicate in both transport hooks.

Cancellation while an asynchronous BEFORE_REQUEST is pending settles the returned promise and triggers cleanup immediately; the hook itself is not abortable. Its later rejection is caught and cannot become a transport notification or an unhandled rejection. If it completes, the existing cancellation check prevents fetch. Cancellation after fetch starts aborts its signal and suppresses transport reporting/transformation, even if the rejection arrives later. A response that wins the cancellation race can still be observed. Existing CancelablePromise cancellation semantics are unchanged; no generator hook can cancel side effects inside application hooks. A never-settling hook needs application-owned cancellation/timeouts.
