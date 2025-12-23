/**
 * Cloudflare Worker - 网盘秒传JSON生成器 (SSE版本)
 * 支持: 123网盘, 189网盘, 夸克网盘
 */

import indexHTML from "./index.html";
import { create123RapidTransfer } from "./service123.js";
import { create189RapidTransfer } from "./service189.js";
import { createQuarkRapidTransfer } from "./serviceQuark.js";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }});
    }

    if (url.pathname === "/") {
      return new Response(indexHTML, {
        headers: { "Content-Type": "text/html;charset=utf-8" },
      });
    }

    if (url.pathname === "/api/stream" && request.method === "GET") {
      return handleStreamRequest(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function handleStreamRequest(request) {
  const {readable, writable} = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const url = new URL(request.url);

  const sendEvent = async (type, data) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
    } catch (e) {
      console.error("Write event failed:", e);
    }
  };

  const execute = async () => {
    try {
      const panType = url.searchParams.get('panType');
      const shareUrl = url.searchParams.get('shareUrl');
      const sharePassword = url.searchParams.get('sharePassword');
      const cookie = url.searchParams.get('cookie');

      if (!panType || !shareUrl) {
        throw new Error("缺少必要参数: panType 和 shareUrl");
      }
      
      const serviceMap = {
        '123': create123RapidTransfer,
        '189': create189RapidTransfer,
        'quark': createQuarkRapidTransfer,
      };

      if (!serviceMap[panType]) {
        throw new Error(`不支持的网盘类型: ${panType}`);
      }
      
      const serviceFn = serviceMap[panType];
      if (panType === 'quark') {
        await serviceFn(shareUrl, sharePassword || '', cookie, writer);
      } else {
        await serviceFn(shareUrl, sharePassword || '', writer);
      }

    } catch (error) {
      console.error("SSE execution error:", error.stack);
      await sendEvent('error', { message: error.message });
    } finally {
      try {
        await writer.close();
      } catch (e) {
        // Ignore if already closed
      }
    }
  };

  execute();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
