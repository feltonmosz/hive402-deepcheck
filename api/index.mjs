// Vercel serverless entry: re-exports the Express app (server.mjs).
// Vercel invokes Node functions as a standard (req, res) request listener,
// and an Express app IS a request listener — so no adapter package is
// needed (serverless-http is an AWS Lambda event adapter and would NOT
// work on Vercel's invocation model). vercel.json routes all paths here.
import app from "../server.mjs";

export default app;
