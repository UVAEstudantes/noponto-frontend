import { config } from "@/src/config/env";

const API_URL = config.API_BASE_URL;

interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
}

interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  if (!response.ok) {
    const errorData = isJson ? await response.json() : await response.text();
    return {
      ok: false,
      error:
        typeof errorData === "string"
          ? errorData
          : errorData.message || "Erro na requisição",
      status: response.status,
    };
  }

  const data = isJson ? await response.json() : await response.text();
  return {
    ok: true,
    data,
    status: response.status,
  };
}

function buildUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean>,
): string {
  const url = new URL(endpoint, API_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }
  return url.toString();
}

export const api = {
  get: async <T = any>(
    endpoint: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> => {
    try {
      const url = buildUrl(endpoint, options?.params);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });
      return handleResponse<T>(response);
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao conectar com servidor",
        status: 0,
      };
    }
  },

  post: async <T = any>(
    endpoint: string,
    data?: any,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> => {
    try {
      const url = buildUrl(endpoint, options?.params);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      return handleResponse<T>(response);
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao conectar com servidor",
        status: 0,
      };
    }
  },

  put: async <T = any>(
    endpoint: string,
    data?: any,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> => {
    try {
      const url = buildUrl(endpoint, options?.params);
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      return handleResponse<T>(response);
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao conectar com servidor",
        status: 0,
      };
    }
  },

  delete: async <T = any>(
    endpoint: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> => {
    try {
      const url = buildUrl(endpoint, options?.params);
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });
      return handleResponse<T>(response);
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao conectar com servidor",
        status: 0,
      };
    }
  },
};
