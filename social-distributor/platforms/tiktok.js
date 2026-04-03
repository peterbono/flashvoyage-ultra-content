/**
 * TikTok Publisher — FlashVoyage Social Distributor
 * Publishes videos to TikTok via Content Posting API v2.
 *
 * Flow:
 * 1. Init upload: POST /v2/post/publish/inbox/video/init/
 * 2. Upload video chunks to the upload URL
 * 3. TikTok processes and publishes
 */

const TIKTOK_API = 'https://open.tiktokapis.com/v2';

/**
 * Publish a video to TikTok.
 * @param {Buffer} videoBuffer - Video file buffer (MP4)
 * @param {string} caption - Post caption
 * @param {string} accessToken - TikTok OAuth access token
 * @returns {Promise<{publishId: string}>}
 */
export async function publishToTikTok({ videoBuffer, caption, accessToken }) {
  if (!accessToken) throw new Error('TikTok access token required');

  console.log(`[TIKTOK] Publishing video (${videoBuffer.length} bytes)...`);

  // Step 1: Initialize video upload
  const initRes = await fetch(`${TIKTOK_API}/post/publish/inbox/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoBuffer.length,
        chunk_size: videoBuffer.length, // single chunk for small files
        total_chunk_count: 1,
      },
    }),
  });
  const initData = await initRes.json();

  if (initData.error?.code) {
    throw new Error(`TikTok init failed: ${initData.error.message} (${initData.error.code})`);
  }

  const publishId = initData.data?.publish_id;
  const uploadUrl = initData.data?.upload_url;
  console.log(`[TIKTOK] Upload initialized: publish_id=${publishId}`);

  if (!uploadUrl) throw new Error('No upload URL returned');

  // Step 2: Upload video
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`TikTok upload failed: ${uploadRes.status} ${uploadRes.statusText}`);
  }
  console.log(`[TIKTOK] Video uploaded`);

  // Step 3: Check publish status
  // TikTok processes asynchronously — the video appears in the creator's inbox
  // They need to confirm publication in the TikTok app
  console.log(`[TIKTOK] Video sent to creator inbox (publish_id: ${publishId})`);
  console.log(`[TIKTOK] NOTE: Creator must confirm publish in TikTok app`);

  return { publishId };
}

/**
 * Publish directly (without inbox confirmation) using direct post API.
 * Requires video.publish scope.
 */
export async function directPublishToTikTok({ videoBuffer, caption, accessToken }) {
  if (!accessToken) throw new Error('TikTok access token required');

  console.log(`[TIKTOK] Direct publish (${videoBuffer.length} bytes, caption: ${caption.slice(0, 50)}...)...`);

  // Step 1: Init direct post with file upload
  const initRes = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoBuffer.length,
        chunk_size: videoBuffer.length,
        total_chunk_count: 1,
      },
    }),
  });
  const initData = await initRes.json();

  if (initData.error?.code) {
    throw new Error(`TikTok direct init failed: ${initData.error.message} (${initData.error.code})`);
  }

  const publishId = initData.data?.publish_id;
  const uploadUrl = initData.data?.upload_url;
  console.log(`[TIKTOK] Direct upload initialized: publish_id=${publishId}`);

  if (!uploadUrl) throw new Error('No upload URL returned');

  // Step 2: Upload video
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
    },
    body: videoBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`TikTok upload failed: ${uploadRes.status}`);
  }

  console.log(`[TIKTOK] Direct publish complete: ${publishId}`);
  return { publishId };
}
