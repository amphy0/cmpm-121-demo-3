// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

import { Board, Cache, Cell, Coin } from "./board.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.9894, -122.0627);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const board = new Board(TILE_DEGREES, NEIGHBORHOOD_SIZE);

let playerWallet: Coin[] = [];

// Memento pattern: cache state tracking
const cacheStates: Map<string, Coin[]> = new Map();
const activeCacheRects: Map<string, leaflet.Rectangle> = new Map();

// UI
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

const movePanel = document.createElement("div");
movePanel.innerHTML = `
<button id="move-up">⬆️</button>
<button id="move-left">⬅️</button>
<button id="move-down">⬇️</button>
<button id="move-right">➡️</button>
<button id="auto-update">🌐</button>
<button id="reset-game">🚮</button>
`;
controlPanel.appendChild(movePanel);

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

// Array to store the player's movement history
const movementHistory: leaflet.LatLng[] = [OAKES_CLASSROOM];

// Create a polyline to represent the movement history
const movementPolyline = leaflet.polyline(movementHistory, { color: "blue" });
movementPolyline.addTo(map);

function movePlayer(deltaLat: number, deltaLng: number) {
  const playerLat = playerMarker.getLatLng().lat + deltaLat;
  const playerLng = playerMarker.getLatLng().lng + deltaLng;
  const location = leaflet.latLng(playerLat, playerLng);

  // Update the player's marker position
  playerMarker.setLatLng(location);

  // Add the new location to the movement history
  movementHistory.push(location);

  // Update the polyline to include the new location
  movementPolyline.setLatLngs(movementHistory);

  // Populate the map with new data
  populateMap();
}

// Attach button event listeners
document
  .getElementById("move-up")!
  .addEventListener("click", () => movePlayer(TILE_DEGREES, 0));
document
  .getElementById("move-down")!
  .addEventListener("click", () => movePlayer(-TILE_DEGREES, 0));
document
  .getElementById("move-left")!
  .addEventListener("click", () => movePlayer(0, -TILE_DEGREES));
document
  .getElementById("move-right")!
  .addEventListener("click", () => movePlayer(0, TILE_DEGREES));

const autoUpdateButton = document.getElementById("auto-update")!;
let geolocationWatchId: number | null = null;

autoUpdateButton.addEventListener("click", () => {
  if (geolocationWatchId === null) {
    if ("geolocation" in navigator) {
      autoUpdateButton.innerHTML = "🌐 (on)";
      geolocationWatchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = leaflet.latLng(latitude, longitude);

          // Update the player's marker position
          playerMarker.setLatLng(newLocation);

          // Add the new location to the movement history
          movementHistory.push(newLocation);

          // Update the polyline to include the new location
          movementPolyline.setLatLngs(movementHistory);

          // Snap the map to the player's location
          map.setView(newLocation, GAMEPLAY_ZOOM_LEVEL);

          // Populate the map with new data
          populateMap();
        },
        (error) => {
          console.error("Error watching geolocation:", error);
          statusPanel.innerHTML = "Geolocation error.";
        },
        { enableHighAccuracy: true },
      );
    } else {
      statusPanel.innerHTML = "Geolocation is not supported by your browser.";
    }
  } else {
    // Disable geolocation updates
    navigator.geolocation.clearWatch(geolocationWatchId);
    geolocationWatchId = null;
    autoUpdateButton.innerHTML = "🌐";
  }
});

document.getElementById("reset-game")!.addEventListener("click", () => {
  const confirmation = prompt(
    "Are you sure you want to erase your game state? (This will reset all progress and erase location history)",
  );
  if (confirmation?.toLowerCase() === "yes") {
    // Reset the player's wallet
    playerWallet = [];

    // Return all coins to their original caches
    for (const [cellKey, coins] of cacheStates) {
      cacheStates.set(cellKey, [...coins]);
    }

    // Clear active cache rectangles
    for (const rect of activeCacheRects.values()) {
      rect.remove();
    }
    activeCacheRects.clear();

    // Clear the movement history
    movementHistory.length = 1; // Keep the initial location
    movementPolyline.setLatLngs(movementHistory);

    // Reset the player marker position
    playerMarker.setLatLng(OAKES_CLASSROOM);
    map.setView(OAKES_CLASSROOM, GAMEPLAY_ZOOM_LEVEL);

    // Update the UI
    statusPanel.innerHTML =
      `Game reset. Player has ${playerWallet.length} coins.`;

    // Save the state in localStorage
    saveGameState();

    // Populate the map again
    populateMap();
  }
});

function populateMap() {
  const visibleCells = getVisibleCells(playerMarker.getLatLng());

  for (const cellKey of visibleCells) {
    const cell = board.getCellAtKey(cellKey); // Convert key to Cell object
    spawnCacheIfNeeded(cell, cellKey);
    restoreCacheIfNeeded(cell, cellKey);
  }

  removeInactiveCaches(visibleCells);
}
function spawnCacheIfNeeded(cell: Cell, cellKey: string): void {
  // Check if this cell already has a cache
  if (!cacheStates.has(cellKey)) {
    // Determine if a cache should spawn based on probability
    if (cellLuck(cell) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(cell); // Handles the actual spawning
    }
  }
}

function restoreCacheIfNeeded(cell: Cell, cellKey: string): void {
  // Check if the cache exists but is not currently active
  if (cacheStates.has(cellKey) && !activeCacheRects.has(cellKey)) {
    restoreCache(cell); // Handles the actual restoration to the map
  }
}
function getVisibleCells(location: leaflet.LatLng): Set<string> {
  const visibleCells = new Set<string>(); // Store all visible cell keys
  const nearbyCells = board.getCellsNearPoint(location); // Get neighboring cells

  for (const neighbor of nearbyCells) {
    visibleCells.add(cellToString(neighbor)); // Convert each cell to a string key
  }

  return visibleCells; // Return the set of visible cell keys
}

function removeInactiveCaches(visibleCells: Set<string>): void {
  // Remove caches that are no longer in range
  for (const [cellKey, rect] of activeCacheRects) {
    if (!visibleCells.has(cellKey)) {
      rect.remove();
      activeCacheRects.delete(cellKey);
    }
  }
}

function spawnCache(cellToSpawn: Cell) {
  const bounds = board.getCellBounds(cellToSpawn);
  const pointValue = Math.floor(cellLuck(cellToSpawn) * 100);
  const cache = board.createNewCache(cellToSpawn, pointValue);

  cacheStates.set(cellToString(cellToSpawn), [...cache.coins]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  activeCacheRects.set(cellToString(cellToSpawn), rect);

  rect.bindPopup(() => createPopupContent(cache, cellToSpawn));
}

function restoreCache(cell: Cell) {
  const savedCoins = cacheStates.get(cellToString(cell))!;
  const bounds = board.getCellBounds(cell);
  const cache = {
    location: cell,
    coins: [...savedCoins],
    serialNumber: savedCoins.length,
  };

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  activeCacheRects.set(cellToString(cell), rect);

  rect.bindPopup(() => createPopupContent(cache, cell));
}

function createPopupContent(cache: Cache, cell: Cell): HTMLElement {
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `
<div>There is a cache here at "${cellToString(cell)}". 
There are <span id="value">${cache.coins.length}</span> coins here.</div>
<button id="collect">Collect</button>
<button id="deposit">Deposit</button>`;

  popupDiv
    .querySelector<HTMLButtonElement>("#collect")!
    .addEventListener("click", () => {
      if (cache.coins.length > 0) {
        const coin = cache.coins.pop()!;
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerText = cache
          .coins.length.toString();
        playerWallet.push(coin);
        statusPanel.innerHTML = `Collected coin: ${serializeCoin(coin)}`;
        cacheStates.set(cellToString(cell), [...cache.coins]); // Save updated state

        // Save the state in localStorage
        saveGameState();
      }
    });

  popupDiv
    .querySelector<HTMLButtonElement>("#deposit")!
    .addEventListener("click", () => {
      if (playerWallet.length > 0) {
        const coin = playerWallet.pop()!;
        cache.coins.push(coin);
        popupDiv.querySelector<HTMLSpanElement>("#value")!.innerText = cache
          .coins.length.toString();
        statusPanel.innerHTML = `Deposited coin: ${serializeCoin(coin)}`;
        cacheStates.set(cellToString(cell), [...cache.coins]);

        // Save the state in localStorage
        saveGameState();
      }
    });

  return popupDiv;
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

// Save the game state to localStorage
function saveGameState() {
  const gameState = {
    playerWallet,
    cacheStates: Array.from(cacheStates.entries()),
    movementHistory: movementHistory.map((latLng) => ({
      lat: latLng.lat,
      lng: latLng.lng,
    })),
  };
  localStorage.setItem("geocoinCarrierGameState", JSON.stringify(gameState));
}

// Load the game state from localStorage
function loadGameState() {
  const savedState = localStorage.getItem("geocoinCarrierGameState");
  if (savedState) {
    const gameState = JSON.parse(savedState);
    playerWallet = gameState.playerWallet;
    cacheStates.clear();
    gameState.cacheStates.forEach(([cellKey, coins]: [string, Coin[]]) => {
      cacheStates.set(cellKey, coins);
    });

    movementHistory.length = 0;
    movementHistory.push(
      ...gameState.movementHistory.map((latLng: { lat: number; lng: number }) =>
        leaflet.latLng(latLng.lat, latLng.lng)
      ),
    );

    // Update the polyline with the restored movement history
    movementPolyline.setLatLngs(movementHistory);

    // Reposition player marker and map view
    if (movementHistory.length > 0) {
      const lastLocation = movementHistory[movementHistory.length - 1];
      playerMarker.setLatLng(lastLocation);
      map.setView(lastLocation, GAMEPLAY_ZOOM_LEVEL);
    }

    // Populate the map again with restored state
    populateMap();
  }
}

loadGameState(); // Load saved game state when the game is initialized
