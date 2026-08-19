import { getEmbedding } from "./src/lib/llm";
getEmbedding("hello world")
  .then(res => console.log("Success! Array length:", res.length))
  .catch(err => console.error("Error:", err));
