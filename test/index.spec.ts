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
