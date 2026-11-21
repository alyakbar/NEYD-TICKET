import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

function detectImageFormat(buffer: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  // WEBP: 'RIFF' .... 'WEBP'
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Authentication required to upload posters.' }, { status: 401 });
    }

    const apiBaseUrl = process.env.API_SERVICE_URL
      ? `${process.env.API_SERVICE_URL.replace(/\/+$/, '')}/api`
      : (
          process.env.API_SERVER_URL ||
          process.env.NEXT_PUBLIC_API_URL ||
          'http://localhost:3001/api'
        );

    try {
      const authResponse = await fetch(`${apiBaseUrl.replace(/\/+$/, '')}/auth/me`, {
        headers: { Authorization: authHeader },
        cache: 'no-store',
      });
      if (!authResponse.ok) {
        return NextResponse.json({ message: 'Invalid or expired administrator token.' }, { status: 403 });
      }
      const data = await authResponse.json().catch(() => ({}));
      const user = data?.user ?? data;
      const role = user?.role;
      const allowedRoles = ['super-administrator', 'it-support-manager', 'it-support-agent', 'administrator'];
      if (!role || !allowedRoles.includes(role)) {
        return NextResponse.json(
          { message: 'Only administrators and managers have permission to upload posters.' },
          { status: 403 },
        );
      }
    } catch (authError) {
      console.error('Auth verification failed in upload-poster route:', authError);
      return NextResponse.json({ message: 'Authorization service unavailable.' }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ message: 'No image file provided.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    if (buffer.byteLength > 4 * 1024 * 1024) {
      return NextResponse.json({ message: 'Image exceeds the maximum allowed 4 MB limit.' }, { status: 400 });
    }

    const detectedExt = detectImageFormat(buffer);
    if (!detectedExt) {
      return NextResponse.json(
        { message: 'Invalid file contents. Only authentic JPEG, PNG, or WEBP images are accepted.' },
        { status: 400 },
      );
    }

    const filename = `poster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${detectedExt}`;
    const basePath = process.cwd().endsWith('apps/web')
      ? process.cwd()
      : path.join(process.cwd(), 'apps/web');
    const uploadDir = path.join(basePath, 'public', 'posters');

    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    return NextResponse.json({ url: `/posters/${filename}` });
  } catch (err) {
    console.error('Poster upload failed:', err);
    return NextResponse.json({ message: 'Poster upload failed.' }, { status: 500 });
  }
}
