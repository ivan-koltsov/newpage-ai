const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = ai.getGenerativeModel({ model: "gemini-flash-latest" });
    const res = await model.generateContent("Hello");
    console.log("Success!", res.response.text().trim());
  } catch (err) {
    console.error("Gemini Error:", err.message);
  }
}
test();
