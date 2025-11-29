import axios from 'axios';

async function testSearch() {
  try {
    console.log('Testing /api/search with query "batman"...');
    const response = await axios.get('http://localhost:3000/api/search?query=batman');
    
    if (response.status === 200) {
      console.log('Status: OK');
      
      const data = response.data;
      if (data.feed && Array.isArray(data.feed)) {
        console.log(`Success! Received ${data.feed.length} items in "feed".`);
        
        if (data.feed.length > 0) {
          console.log('First item:', data.feed[0].title);
          
          if (data.feed[0].title.toLowerCase().includes('batman')) {
             console.log('Content verification: Passed (Title contains "batman")');
          } else {
             console.log('Content verification: Warning (First title does not contain "batman", might be relevance sorting)');
          }
        }
      } else {
        console.error('Failure: Response does not contain "feed" array.');
        console.log('Received keys:', Object.keys(data));
      }
    } else {
      console.error(`Failure: Status code ${response.status}`);
    }
  } catch (error) {
    console.error('Error running test:', error.message);
    if (error.response) {
        console.error('Response data:', error.response.data);
    }
  }
}

testSearch();
