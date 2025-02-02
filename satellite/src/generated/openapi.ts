/**
 * This file was auto-generated by openapi-typescript.
 * Do not make direct changes to the file.
 */

export interface paths {
    "/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Connection status to Companion */
        get: operations["getConnectionStatus"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/surfaces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Connected surfaces */
        get: operations["getConnectedSurfaces"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/surfaces/rescan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rescan for connected surfaces */
        post: operations["postSurfaceesScan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get current configuration */
        get: operations["getConfig"];
        put?: never;
        /** Update current configuration */
        post: operations["updateConfig"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ErrorResponse: {
            error: string;
        };
        StatusResponse: {
            /** @description Whether the client is connected to the Companion Satellite */
            connected: boolean;
            /** @description Version of the Companion Satellite */
            companionVersion: string | null;
            /** @description API version of the Companion Satellite */
            companionApiVersion: string | null;
        };
        ConfigData: {
            /** @description Address of the Companion server to connect to */
            host: string;
            /** @description Port number of the Companion server to connect to */
            port: number;
            /** @description Name of the installation, reported in the mDNS announcement */
            installationName: string;
            /** @description Enable mDNS announcement to allow automatic discovery of the Companion Satellite */
            mdnsEnabled: boolean;
            /** @description Enable the HTTP api. This is readonly in the HTTP api */
            httpEnabled: boolean;
            /** @description Port number of the HTTP api. This is readonly in the HTTP api */
            httpPort: number;
        };
        ConfigDataUpdate: {
            /** @description Address of the Companion server to connect to */
            host?: string;
            /** @description Port number of the Companion server to connect to */
            port?: number;
            /** @description Name of the installation, reported in the mDNS announcement */
            installationName?: string;
            /** @description Enable mDNS announcement to allow automatic discovery of the Companion Satellite */
            mdnsEnabled?: boolean;
        };
        SurfaceInfo: {
            /** @description ID of the surface */
            surfaceId: string;
            /** @description Product Name of the surface */
            productName: string;
            /** @description Plugin ID of the surface */
            pluginId: string;
            /** @description Plugin name of the surface */
            pluginName: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getConnectionStatus: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StatusResponse"];
                };
            };
            /** @description failed operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getConnectedSurfaces: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SurfaceInfo"][];
                };
            };
            /** @description failed operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    postSurfaceesScan: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description failed operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    getConfig: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigData"];
                };
            };
            /** @description failed operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
    updateConfig: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": components["schemas"]["ConfigDataUpdate"];
            };
        };
        responses: {
            /** @description successful operation */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfigData"];
                };
            };
            /** @description failed operation */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ErrorResponse"];
                };
            };
        };
    };
}
