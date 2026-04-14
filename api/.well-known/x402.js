export default function handler(req) {
  return new Response(JSON.stringify({
    version: 1,
    resources: ["POST /api/scrape/x402"]
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export const config = {
  runtime: "edge",
};
