import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ContractOperation,
  type JsonSchema,
  publicContractOperations,
  publicJsonSchemaDefinitions,
  publicOpenApiInfo,
} from "../src/contract-artifact-registry.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const contractsRoot = join(packageRoot, "contracts");
const jsonSchemaRoot = join(contractsRoot, "json-schema");
const openApiPath = join(contractsRoot, "openapi.json");
const checkMode = process.argv.includes("--check");

interface Artifact {
  path: string;
  content: string;
}

const schemaNames = Object.keys(publicJsonSchemaDefinitions).sort();
const expectedJsonSchemaFiles = new Set(schemaNames.map((name) => `${toKebabCase(name)}.schema.json`));
const artifacts = [
  ...schemaNames.map((name) => ({
    path: join(jsonSchemaRoot, `${toKebabCase(name)}.schema.json`),
    content: serialize(buildJsonSchemaArtifact(name)),
  })),
  {
    path: openApiPath,
    content: serialize(buildOpenApiArtifact()),
  },
];

if (checkMode) {
  await checkArtifacts(artifacts);
} else {
  await cleanStaleJsonSchemas();
  for (const artifact of artifacts) {
    await writeFile(artifact.path, artifact.content, "utf8");
  }
}

async function checkArtifacts(expectedArtifacts: Artifact[]) {
  const failures: string[] = [];

  for (const artifact of expectedArtifacts) {
    let current: string | undefined;
    try {
      current = await readFile(artifact.path, "utf8");
    } catch {
      failures.push(`missing ${relativeArtifactPath(artifact.path)}`);
      continue;
    }
    if (current !== artifact.content) {
      failures.push(`stale ${relativeArtifactPath(artifact.path)}`);
    }
  }

  const existingSchemaFiles = await readdir(jsonSchemaRoot);
  for (const file of existingSchemaFiles) {
    if (file.endsWith(".schema.json") && !expectedJsonSchemaFiles.has(file)) {
      failures.push(`unexpected ${relativeArtifactPath(join(jsonSchemaRoot, file))}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Contract artifacts are not up to date:\n${failures.map((failure) => `- ${failure}`).join("\n")}\nRun: pnpm --filter @reservation-platform/contract-types run contracts:generate`);
  }
}

async function cleanStaleJsonSchemas() {
  const existingSchemaFiles = await readdir(jsonSchemaRoot);
  await Promise.all(existingSchemaFiles
    .filter((file) => file.endsWith(".schema.json") && !expectedJsonSchemaFiles.has(file))
    .map((file) => rm(join(jsonSchemaRoot, file))));
}

function buildJsonSchemaArtifact(name: string) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://reservation-platform.local/contracts/json-schema/${toKebabCase(name)}.schema.json`,
    title: name,
    $ref: `#/$defs/${name}`,
    $defs: publicJsonSchemaDefinitions,
  };
}

function buildOpenApiArtifact() {
  return {
    openapi: "3.1.0",
    info: publicOpenApiInfo,
    servers: [
      {
        url: "https://api.example.com",
        description: "Replace with the reservation platform backend base URL.",
      },
    ],
    tags: [
      { name: "Metadata" },
      { name: "Tenants" },
      { name: "Catalog" },
      { name: "Availability" },
      { name: "Reservations" },
      { name: "Resource maintenance" },
      { name: "Chat", description: "Module-gated. Disabled backends return chat_module_disabled in the shared error shape." },
    ],
    paths: buildOpenApiPaths(publicContractOperations),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
      parameters: {
        TenantIdHeader: {
          name: "X-Reservation-Tenant-Id",
          in: "header",
          required: false,
          schema: { type: "string" },
        },
        VenueIdHeader: {
          name: "X-Reservation-Venue-Id",
          in: "header",
          required: false,
          schema: { type: "string" },
        },
        CorrelationIdHeader: {
          name: "X-Correlation-Id",
          in: "header",
          required: false,
          schema: { type: "string" },
        },
        IdempotencyKeyHeader: {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string" },
        },
      },
      schemas: Object.fromEntries(schemaNames.map((name) => [
        name,
        toOpenApiSchema(publicJsonSchemaDefinitions[name]),
      ])),
    },
  };
}

function buildOpenApiPaths(operations: ContractOperation[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    paths[operation.path] ??= {};
    paths[operation.path][operation.method] = buildOpenApiOperation(operation);
  }
  return paths;
}

function buildOpenApiOperation(operation: ContractOperation) {
  const queryParameters = operation.querySchema ? buildQueryParameters(operation.querySchema) : [];
  const pathParameters = (operation.pathParameters ?? []).map((name) => ({
    name,
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
  const headerParameters = [
    { $ref: "#/components/parameters/TenantIdHeader" },
    { $ref: "#/components/parameters/VenueIdHeader" },
    { $ref: "#/components/parameters/CorrelationIdHeader" },
    ...(operation.idempotencyRequired ? [{ $ref: "#/components/parameters/IdempotencyKeyHeader" }] : []),
  ];
  const parameters = [...pathParameters, ...queryParameters, ...headerParameters];

  return {
    operationId: operation.operationId,
    summary: operation.summary,
    tags: operation.tags,
    ...(operation.authentication === "public" ? {} : { security: [{ bearerAuth: [] }] }),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(operation.requestBodySchema ? {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: componentRef(operation.requestBodySchema),
          },
        },
      },
    } : {}),
    responses: buildResponses(operation),
    ...(operation.idempotencyRequired ? { "x-idempotency-required": true } : {}),
    ...(operation.moduleGated ? { "x-module-gated": operation.moduleGated } : {}),
    ...(operation.disabledErrorCode ? { "x-disabled-error-code": operation.disabledErrorCode } : {}),
  };
}

function buildQueryParameters(schemaName: string) {
  const schema = publicJsonSchemaDefinitions[schemaName];
  const properties = schema.properties as Record<string, JsonSchema> | undefined;
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return Object.entries(properties ?? {}).map(([name, propertySchema]) => ({
    name,
    in: "query",
    required: required.has(name),
    schema: toOpenApiSchema(propertySchema),
  }));
}

function buildResponses(operation: ContractOperation) {
  const successStatus = operation.successStatus ?? "200";
  const successResponse = operation.operationId === "streamChatMessage"
    ? {
        description: "Streaming chat response.",
        content: {
          "text/event-stream": {
            schema: { type: "string" },
          },
        },
      }
    : {
        description: "Successful response.",
        content: {
          "application/json": {
            schema: componentRef(operation.responseSchema),
          },
        },
      };

  return {
    [successStatus]: successResponse,
    ...(operation.disabledErrorCode ? {
      "503": {
        description: `${operation.disabledErrorCode} module-disabled response.`,
        content: {
          "application/json": {
            schema: componentRef("PlatformErrorResponse"),
          },
        },
      },
    } : {}),
    default: {
      description: "Platform error response.",
      content: {
        "application/json": {
          schema: componentRef("PlatformErrorResponse"),
        },
      },
    },
  };
}

function componentRef(schemaName: string) {
  return { $ref: `#/components/schemas/${schemaName}` };
}

function toOpenApiSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toOpenApiSchema);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [
    key,
    key === "$ref" && typeof child === "string"
      ? child.replace("#/$defs/", "#/components/schemas/")
      : toOpenApiSchema(child),
  ]));
}

function serialize(value: unknown) {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, sortKeys(child)]));
}

function toKebabCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function relativeArtifactPath(path: string) {
  return path.replace(`${packageRoot}\\`, "").replaceAll("\\", "/");
}
