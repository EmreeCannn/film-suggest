import axios from "axios";

const BASE_URL = "http://localhost:3000/api/all";

async function testPagination() {
  try {
    console.log("Fetching page 1...");
    const res1 = await axios.get(`${BASE_URL}?page=1`, {
        headers: { "x-app-secret": process.env.APP_SECRET || "mysecretkey" } // Assuming default or env
    });
    
    if (!res1.data.feed || res1.data.feed.length === 0) {
        console.error("Page 1 returned no movies!");
        return;
    }

    const firstMoviePage1 = res1.data.feed[0];
    console.log(`Page 1 First Movie: ${firstMoviePage1.title} (ID: ${firstMoviePage1.id})`);

    console.log("Fetching page 2...");
    const res2 = await axios.get(`${BASE_URL}?page=2`, {
        headers: { "x-app-secret": process.env.APP_SECRET || "mysecretkey" }
    });

    if (!res2.data.feed || res2.data.feed.length === 0) {
        console.error("Page 2 returned no movies!");
        return;
    }

    const firstMoviePage2 = res2.data.feed[0];
    console.log(`Page 2 First Movie: ${firstMoviePage2.title} (ID: ${firstMoviePage2.id})`);

    if (firstMoviePage1.id !== firstMoviePage2.id) {
      console.log("SUCCESS: Page 1 and Page 2 returned different movies.");
    } else {
      console.error("FAILURE: Page 1 and Page 2 returned the same movies.");
    }

  } catch (error) {
    console.error("Test failed:", error.message);
    if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
    }
  }
}

testPagination();
