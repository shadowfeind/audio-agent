import path from "path";
import { UTApi } from "uploadthing/server";

export type UploadProvider = {
  uploadBuffer: (params: {
    fileName: string;
    content: Buffer;
    mimeType: string;
  }) => Promise<{ url: string; key: string }>;
  uploadFilePath: (params: {
    filePath: string;
    mimeType: string;
  }) => Promise<{ url: string; key: string }>;
};

export function createUploadThingProvider(token: string): UploadProvider {
  const utapi = new UTApi({ token });

  async function uploadBuffer(params: {
    fileName: string;
    content: Buffer;
    mimeType: string;
  }) {
    const file = new File([new Uint8Array(params.content)], params.fileName, {
      type: params.mimeType,
    });
    const upload = await utapi.uploadFiles(file);

    if (upload.error || !upload.data) {
      throw new Error(upload.error?.message || "UploadThing upload failed.");
    }

    return {
      url: upload.data.ufsUrl,
      key: upload.data.key,
    };
  }

  return {
    uploadBuffer,
    async uploadFilePath({ filePath, mimeType }) {
      const content = await import("fs/promises").then(({ readFile }) => readFile(filePath));
      return uploadBuffer({
        fileName: path.basename(filePath),
        content,
        mimeType,
      });
    },
  };
}
