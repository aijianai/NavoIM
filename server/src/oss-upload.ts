import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";

interface OssBindingRow {
  id: string;
  user_id: string;
  name: string;
  provider: string;
  endpoint: string;
  bucket: string;
  region: string | null;
  access_key_id: string;
  access_key_secret: string;
  is_default: number;
}

export async function getDefaultOssBinding(userId: string): Promise<OssBindingRow | null> {
  const { queryOne } = await import("./db.js");
  return (await queryOne<OssBindingRow>(
    "SELECT * FROM oss_bindings WHERE user_id = ? AND is_default = 1 LIMIT 1",
    [userId]
  )) ?? null;
}

export async function getDefaultGlobalOssBinding(): Promise<OssBindingRow | null> {
  const { queryOne } = await import("./db.js");
  return (await queryOne<OssBindingRow>(
    "SELECT * FROM oss_bindings WHERE is_default = 1 LIMIT 1"
  )) ?? null;
}

export async function uploadToOss(
  binding: OssBindingRow,
  filePath: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  const fileBuffer = readFileSync(filePath);
  const key = `uploads/${fileName}`;

  const client = new S3Client({
    endpoint: binding.endpoint,
    region: binding.region || "us-east-1",
    credentials: {
      accessKeyId: binding.access_key_id,
      secretAccessKey: binding.access_key_secret,
    },
    forcePathStyle: true,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: binding.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    })
  );

  const baseUrl = binding.endpoint.replace(/\/+$/, "");
  return `${baseUrl}/${binding.bucket}/${key}`;
}
