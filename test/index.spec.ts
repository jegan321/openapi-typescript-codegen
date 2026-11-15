import { readFileSync } from 'fs';
import { sync } from 'glob';

import { generate, HttpClient } from '../';

describe('v2', () => {
    it('should generate', async () => {
        await generate({
            input: './test/spec/v2.json',
            output: './test/generated/v2/',
            httpClient: HttpClient.FETCH,
            useOptions: false,
            useUnionTypes: false,
            exportCore: true,
            exportSchemas: true,
            exportModels: true,
            exportServices: true,
        });

        sync('./test/generated/v2/**/*.ts').forEach(file => {
            const content = readFileSync(file, 'utf8').toString();
            expect(content).toMatchSnapshot(file);
        });
    });
});

describe('v3', () => {
    it('should generate', async () => {
        await generate({
            input: './test/spec/v3.json',
            output: './test/generated/v3/',
            httpClient: HttpClient.FETCH,
            useOptions: false,
            useUnionTypes: false,
            exportCore: true,
            exportSchemas: true,
            exportModels: true,
            exportServices: true,
        });

        sync('./test/generated/v3/**/*.ts').forEach(file => {
            const content = readFileSync(file, 'utf8').toString();
            expect(content).toMatchSnapshot(file);
        });
    });
});

describe('fetch before-request hook', () => {
    it('waits for asynchronous URL and authentication configuration', async () => {
        const { request } = require('./generated/v3/core/request');
        const { OpenAPI } = require('./generated/v3/core/OpenAPI');
        let release!: () => void;
        const pending = new Promise<void>(resolve => {
            release = resolve;
        });
        const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
        const config = {
            ...OpenAPI,
            BASE: 'https://old.example',
            BEFORE_REQUEST: async (options: any) => {
                await pending;
                config.BASE = 'https://configured.example';
                options.headers = { Authorization: 'Bearer token' };
            },
        };
        try {
            const result = request(config, { method: 'GET', url: '/test' });
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(fetchMock).not.toHaveBeenCalled();
            release();
            await result;
            expect(fetchMock.mock.calls[0][0]).toBe('https://configured.example/test');
            expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token');
        } finally {
            release();
            fetchMock.mockRestore();
        }
    });

    it('rejects without sending a request when the asynchronous hook fails', async () => {
        const { request } = require('./generated/v3/core/request');
        const { OpenAPI } = require('./generated/v3/core/OpenAPI');
        const failure = new Error('Token refresh failed');
        const fetchMock = jest.spyOn(globalThis, 'fetch');
        try {
            await expect(
                request(
                    {
                        ...OpenAPI,
                        BEFORE_REQUEST: async () => {
                            throw failure;
                        },
                    },
                    { method: 'GET', url: '/test' }
                )
            ).rejects.toBe(failure);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            fetchMock.mockRestore();
        }
    });
});

describe('fetch extensions', () => {
    const options = { method: 'GET', url: '/test', query: { key: { field: ['a', 'b'] } } };
    const runtime = () => require('./generated/v3/core/request');
    const config = () => ({ ...require('./generated/v3/core/OpenAPI').OpenAPI, BASE: '' });
    afterEach(() => jest.restoreAllMocks());

    it.each([204, 400, 500])('tracks the returned promise and observes HTTP %s before API handling', async status => {
        jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }));
        const pending = new Set();
        const cleanup = jest.fn();
        const response = jest.fn();
        const transport = jest.fn();
        const after = jest.fn();
        const error = jest.fn();
        const promise = runtime().request({ ...config(), ON_REQUEST: (p: any) => {
            pending.add(p);
            return () => { pending.delete(p); cleanup(); };
        }, ON_RESPONSE: response, ON_TRANSPORT_ERROR: transport, AFTER_REQUEST: after, ERROR_CALLBACK: error }, options);
        expect(pending.has(promise)).toBe(true);
        if (status === 204) await expect(promise).resolves.toBeUndefined();
        else await expect(promise).rejects.toHaveProperty('status', status);
        expect(pending.size).toBe(0);
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(response).toHaveBeenCalledTimes(1);
        expect(after).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledTimes(status === 204 ? 0 : 1);
        expect(transport).not.toHaveBeenCalled();
    });

    it.each([false, true])('preserves or transforms transport rejection (configured: %s)', async transform => {
        const failure = new TypeError('Failed to fetch');
        const replacement = new Error('NetworkError');
        jest.spyOn(globalThis, 'fetch').mockRejectedValue(failure);
        const observe = jest.fn();
        const response = jest.fn();
        const cleanup = jest.fn();
        await expect(runtime().request({ ...config(), ON_REQUEST: () => cleanup, ON_RESPONSE: response,
            ON_TRANSPORT_ERROR: observe, ...(transform ? { TRANSFORM_TRANSPORT_ERROR: () => replacement } : {}) }, options))
            .rejects.toBe(transform ? replacement : failure);
        expect(observe).toHaveBeenCalledWith(failure, options);
        expect(response).not.toHaveBeenCalled();
        expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])('cleans up BEFORE_REQUEST failure (async: %s)', async asynchronous => {
        const failure = new Error('before');
        const fetch = jest.spyOn(globalThis, 'fetch');
        const cleanup = jest.fn();
        const transport = jest.fn();
        await expect(runtime().request({ ...config(), ON_REQUEST: () => cleanup, ON_TRANSPORT_ERROR: transport,
            BEFORE_REQUEST: asynchronous ? async () => { throw failure; } : () => { throw failure; } }, options)).rejects.toBe(failure);
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(fetch).not.toHaveBeenCalled();
        expect(transport).not.toHaveBeenCalled();
    });

    it.each([false, true])('cleans cancellation during before hook or fetch (fetch started: %s)', async started => {
        let release!: () => void;
        let entered!: () => void;
        const ready = new Promise<void>(resolve => { entered = resolve; });
        const gate = new Promise<void>(resolve => { release = resolve; });
        const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
            entered();
            await gate;
            expect(init?.signal?.aborted).toBe(true);
            throw new Error('aborted');
        });
        const cleanup = jest.fn();
        const transport = jest.fn();
        const promise = runtime().request({ ...config(), ON_REQUEST: () => cleanup, ON_TRANSPORT_ERROR: transport,
            TRANSFORM_TRANSPORT_ERROR: transport, BEFORE_REQUEST: started ? undefined : () => gate }, options);
        const rejected = expect(promise).rejects.toHaveProperty('isCancelled', true);
        if (started) await ready;
        promise.cancel();
        await rejected;
        expect(cleanup).toHaveBeenCalledTimes(1);
        release();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(transport).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledTimes(started ? 1 : 0);
    });

    it('keeps default query encoding and supports synchronous before hooks and custom serialization', async () => {
        const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
        await runtime().request(config(), options);
        expect(fetch.mock.calls[0][0]).toBe('/test?key%5Bfield%5D=a&key%5Bfield%5D=b');
        await runtime().request({ ...config(), BEFORE_REQUEST: (o: any) => { o.url = '/changed'; },
            QUERY_SERIALIZER: (q: any) => runtime().getQueryString(q).replace(/%5B/g, '_').replace(/%5D/g, '') }, { ...options });
        expect(fetch.mock.calls[1][0]).toBe('/changed?key_field=a&key_field=b');
    });
});

it.each([HttpClient.ANGULAR, HttpClient.AXIOS, HttpClient.NODE, HttpClient.XHR])(
    'does not expose fetch extensions in %s output', async httpClient => {
        const output = `./test/generated/compat-${httpClient}`;
        await generate({ input: './test/spec/v3.json', output, httpClient });
        const settings = readFileSync(`${output}/core/OpenAPI.ts`, 'utf8');
        const request = readFileSync(`${output}/core/request.ts`, 'utf8');
        for (const option of ['ON_REQUEST', 'ON_RESPONSE', 'ON_TRANSPORT_ERROR', 'TRANSFORM_TRANSPORT_ERROR', 'QUERY_SERIALIZER']) {
            expect(settings).not.toContain(option);
            expect(request).not.toContain(option);
        }
    }
);
