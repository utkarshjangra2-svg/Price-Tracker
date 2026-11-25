import axios from "axios";

async function testCart() {
  try {
    const res = await axios.post("http://localhost:5000/api/orders/add-to-cart", {
      deal: {
        res_id: 18294259,
        catalogueId: "ctl_436191947",
        restaurant: "Star Crust",
        dishName: "Momos"
      }
    }, {
      // Need a valid token. If we don't have one, we'll get 401.
    });
    console.log(res.data);
  } catch (error) {
    console.log("Error:", error.response?.data || error.message);
  }
}

testCart();
