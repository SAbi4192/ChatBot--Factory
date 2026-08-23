async function runTest() {
  try {
    console.log("Testing Python local LLM server at http://127.0.0.1:8000/api/chat...");
    
    const response = await fetch('http://127.0.0.1:8000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: "System: You are an AI assistant.\nUser: Hello! Are you working?\nAssistant:"
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log("\n==== MODEL RESPONSE ====\n");
    console.log(data.response);
    console.log("\n========================\n");
    
    console.log("SUCCESS!");
    process.exit(0);
  } catch (error) {
    console.error("FAILED TO RUN MODEL TEST:");
    console.error(error);
    process.exit(1);
  }
}

runTest();
