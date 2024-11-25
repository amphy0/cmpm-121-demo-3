const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const gridSize = 8;
const cellSize = 50;
const grid: Cell[][] = [];
const player = { x: 0, y: 0 };

type Cell = {
  water: number;
  sun: number;
};

function createGrid() {
  for (let y = 0; y < gridSize; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < gridSize; x++) {
      row.push({ water: 0, sun: 0 });
    }
    grid.push(row);
  }
}

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const cell = grid[y][x];
      ctx.strokeStyle = "black";
      ctx.strokeRect(x * cellSize, y * cellSize, cellSize, cellSize);

      // Draw water/sun levels
      ctx.fillStyle = "blue";
      ctx.fillText(`W:${cell.water}`, x * cellSize + 5, y * cellSize + 35);
      ctx.fillStyle = "yellow";
      ctx.fillText(`S:${cell.sun}`, x * cellSize + 5, y * cellSize + 50);
    }
  }

  // Draw player
  ctx.fillStyle = "red";
  ctx.fillRect(player.x * cellSize, player.y * cellSize, cellSize, cellSize);
}

function advanceTurn() {
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const cell = grid[y][x];
      cell.sun = Math.random() > 0.5 ? 1 : 0; // Random sun
      cell.water += Math.random() > 0.7 ? 1 : 0; // Random water
    }
  }
}

self.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp" && player.y > 0) player.y--;
  if (e.key === "ArrowDown" && player.y < gridSize - 1) player.y++;
  if (e.key === "ArrowLeft" && player.x > 0) player.x--;
  if (e.key === "ArrowRight" && player.x < gridSize - 1) player.x++;
  if (e.key === "Enter") advanceTurn();
  drawGrid();
});

createGrid();
drawGrid();
