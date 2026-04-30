import { NextResponse } from "next/server";

import { getSupabaseClient } from "@/lib/supabase";

const BUCKET_NAME = "merch-images";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();

  if (fromName && /^[a-z0-9]+$/.test(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }

  switch (file.type) {
    case "image/avif":
      return "avif";
    case "image/gif":
      return "gif";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

async function ensureMerchImagesBucket() {
  const client = getSupabaseClient();
  const bucket = await client.storage.getBucket(BUCKET_NAME);

  if (bucket.error) {
    const createBucket = await client.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: MAX_IMAGE_BYTES,
      allowedMimeTypes: ["image/*"],
    });

    if (createBucket.error) {
      throw new Error(`Unable to create image bucket: ${createBucket.error.message}`);
    }

    return;
  }

  const updateBucket = await client.storage.updateBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: MAX_IMAGE_BYTES,
    allowedMimeTypes: ["image/*"],
  });

  if (updateBucket.error) {
    throw new Error(`Unable to update image bucket: ${updateBucket.error.message}`);
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Upload an AVIF, GIF, JPG, PNG, or WebP image." }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image must be 10MB or smaller." }, { status: 400 });
    }

    await ensureMerchImagesBucket();

    const extension = getFileExtension(file);
    const path = `items/${crypto.randomUUID()}.${extension}`;
    const upload = await getSupabaseClient().storage.from(BUCKET_NAME).upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });

    if (upload.error) {
      throw new Error(`Unable to upload image: ${upload.error.message}`);
    }

    const { data } = getSupabaseClient().storage.from(BUCKET_NAME).getPublicUrl(upload.data.path);

    return NextResponse.json({
      imageUrl: data.publicUrl,
      path: upload.data.path,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to upload image.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
