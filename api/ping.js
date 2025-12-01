export const config = {
  runtime: "edge",
};

export default function handler() {
  return new Response(
    JSON.stringify({ status: "ok knk", time: Date.now() }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
