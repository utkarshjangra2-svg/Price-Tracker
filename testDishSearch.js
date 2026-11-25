import axios from "axios";

async function testSearch() {
  try {
    const response = await axios.post("http://localhost:5000/api/dish-search", {
      dish: "Momos",
      budget: 400,
      location: "Faridabad",
      locationData: { title: "Faridabad" },
      user: { id: "66144e7c4f4a3e2a9c123456" }
    });
    console.log("Deals length:", response.data.deals.length);
    console.log("Meta:", response.data.meta);
    console.log("Source:", response.data.source);
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
  }
}

testSearch();
