const button = document.getElementById("alertButton");

if (button) {
  button.addEventListener("click", () => {
    alert("You clicked the button!");
  });
} else {
  console.error("Button not found!");
}
