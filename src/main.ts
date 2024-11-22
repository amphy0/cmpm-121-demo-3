// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

import { Board, Cell, Coin } from "./board.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.9894, -122.0627);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

const playerWallet: Coin[] = [];

//UI
const app = document.getElementById("app")!;
const gameName = "Geocoin Carrier";
document.title = gameName;
const header = document.createElement("h1");
header.innerHTML = gameName;
app.append(header);

const controlPanel = document.createElement("div");
app.appendChild(controlPanel);

const mapPanel = document.createElement("div");
app.appendChild(mapPanel);
mapPanel.id = "map";

const statusPanel = document.createElement("div");
app.appendChild(statusPanel);
statusPanel.innerHTML = `Player has ${playerWallet.length} coins.`;

const map = leaflet.map(mapPanel, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

function populateMap() {
  const location = OAKES_CLASSROOM;
  for (const neighbor of board.getCellsNearPoint(location)) {
    if (cellLuck(neighbor) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(neighbor);
    }
  }
}

function spawnCache(cellToSpawn: Cell) {
  const bounds = board.getCellBounds(cellToSpawn);
  const pointValue = Math.floor(cellLuck(cellToSpawn) * 100);
  const cache = board.createNewCache(cellToSpawn, pointValue);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Handle interactions with the cache
  rect.bindPopup(() => {
    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>There is a cache here at "${
      cellToString(cellToSpawn)
    }". There are <span id="value">${cache.coins.length}</span> coins here.</div>
                <button id="collect">Collect</button><button id="deposit">Deposit</button>`;

    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        if (cache.coins.length > 0) {
          const coin = cache.coins.pop()!;
          popupDiv.querySelector<HTMLSpanElement>(
            "#value",
          )!.innerHTML = cache.coins.length.toString();
          playerWallet.push(coin);
          statusPanel.innerHTML = `coin serial number: ${serializeCoin(coin)}`;
        }
      });
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        if (playerWallet.length > 0) { // Ensure the wallet is not empty
          const coin = playerWallet.pop()!;
          cache.coins.push(coin);
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML = cache
            .coins.length.toString();
          statusPanel.innerHTML = `Left coin: ${serializeCoin(coin)}`;
        }
      });

    return popupDiv;
  });
}
function serializeCoin(coin: Coin): string {
  return `${coin.spawnLocation.i}:${coin.spawnLocation.j}#${coin.serial}`;
}

function cellToString(cell: Cell): string {
  const { i, j } = cell;
  return `${i}:${j}`;
}

function cellLuck(cell: Cell): number {
  return luck(cellToString(cell));
}

populateMap();
