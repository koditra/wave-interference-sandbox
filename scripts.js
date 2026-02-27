const container = document.getElementById("container");
const energyInfo = document.getElementById("energyInfo");
const motionInfo = document.getElementById("motionInfo");
const attractionInfo = document.getElementById("attractionInfo");

// Cache container dimensions for performance
let containerWidth = container.clientWidth;
let containerHeight = container.clientHeight;
window.addEventListener('resize', () => {
    containerWidth = container.clientWidth;
    containerHeight = container.clientHeight;
});

// Spatial grid for collision detection
const GRID_SIZE = 50;
let spatialGrid = {};
let bondFrameSkip = 0;

const buttonLabels = {
  melting: "Melt",
  freezing: "Freeze",
  vaporization: "Vaporize",
  condensation: "Condense",
  sublimation: "Sublimate",
  deposition: "Deposit",
  ionization: "Ionize",
  recombination: "Recombine"
};

const stateButtons = {
  solid: ["melting", "sublimation"],
  liquid: ["freezing", "vaporization"],
  gas: ["condensation", "deposition", "ionization"],
  plasma: ["recombination"]
};


let currentState = "solid"; // it will start as a solid
let targetTransition = null; // not changing at the start
let speed = 0.3; // particles in a solid vibrate, so they have some energy
let animationTween = 0; // 0-1 for smooth transitions

const stateColors = {
    solid: "#0066ff",    // blue
    liquid: "#00ccff",   // cyan
    gas: "#ffff00",      // yellow
    plasma: "#ff00ff"    // purple/pink mix ig
};

const stateEnergy = {
    solid: "Low",
    liquid: "Medium",
    gas: "High",
    plasma: "Very High"
};

const stateMotion = {
    solid: "Vibrates in place",
    liquid: "Slides past each other",
    gas: "Moves freely and randomly",
    plasma: "Moves extremely fast and chaotic"
};

const stateAttraction = {
    solid: "Very Strong Bonds",
    liquid: "Medium Strength Bonds",
    gas: "Weak Attraction",
    plasma: "No Bonds (Ionized Particles)"
};

const stateSpeeds = {
    solid: 0.3,
    liquid: 1,
    gas: 3,
    plasma: 5
};

const transitionMap = {
    melting:      { from: "solid", to: "liquid" },
    freezing:     { from: "liquid", to: "solid" },
    vaporization: { from: "liquid", to: "gas" },
    condensation: { from: "gas", to: "liquid" },
    sublimation:  { from: "solid", to: "gas" },
    deposition:   { from: "gas", to: "solid" },
    ionization:   { from: "gas", to: "plasma" },
    recombination:{ from: "plasma", to: "gas" }
};



const particles = [];
for (let i = 0; i < 50; i++) {
    const p = document.createElement("div");
    p.classList.add("particle");
    p.style.background = stateColors.solid;  // set initial color
    p.style.position = 'absolute';
    container.appendChild(p);

    particles.push({
        element: p,
        x: Math.random() * containerWidth,
        y: Math.random() * containerHeight,
        vx: 0,
        vy: 0,
        energy: 0.2,
        lastEnergy: 0.2
    });
}

// Setup magnifier elements and clones
const magnifier = document.getElementById('magnifier');
const magnifierInner = document.getElementById('magnifier-inner');
let magnifierRadius = 80;
let magnifierZoom = 1.7;
let magnifierPos = { x: containerWidth / 2, y: containerHeight / 2 };

// Create mirrored clones and magnifier SVG for magnified lines (only if magnifier exists)
if (magnifierInner) {
    // create mirrored clones inside the magnifier (no connection-line SVG)
    particles.forEach(p => {
        const clone = p.element.cloneNode(true);
        clone.classList.add('magnified');
        clone.style.position = 'absolute';
        clone.style.zIndex = '10';
        // ensure clone uses the current state color
        clone.style.background = stateColors[currentState];
        magnifierInner.appendChild(clone);
        p._clone = clone; // reference for updates
    });

    // mouse move to update magnifier position
    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        magnifierPos.x = e.clientX - rect.left;
        magnifierPos.y = e.clientY - rect.top;
        magnifier.style.left = magnifierPos.x + 'px';
        magnifier.style.top = magnifierPos.y + 'px';
        const mask = document.getElementById('maskCircle');
        if (mask) {
            mask.style.left = magnifierPos.x + 'px';
            mask.style.top = magnifierPos.y + 'px';
            mask.classList.remove('hidden');
        }
        // show magnifier
        magnifier.classList.remove('hidden');
    });

    container.addEventListener('mouseleave', () => {
        magnifier.classList.add('hidden');
        const mask = document.getElementById('maskCircle');
        if (mask) mask.classList.add('hidden');
    });
}

function updateButtons(currentState) {
    const container = document.querySelector('.controls');
    container.innerHTML = ''; // remove all existing buttons

    const buttonsToShow = stateButtons[currentState];
    buttonsToShow.forEach(state => {
        const btn = document.createElement('button');
        btn.textContent = buttonLabels[state];
        btn.dataset.transition = state;   // <-- ADD THIS
        btn.onclick = () => changeState(state);
        container.appendChild(btn);
    });
}

//phase change button logic
function changeState(transitionName) {
    const transition = transitionMap[transitionName];
    if (currentState !== transition.from) return; // only allow valid transitions
    targetTransition = transition;
}

// --- SVG for connection lines ---
const connectionLines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
connectionLines.setAttribute("id", "connectionLines");
connectionLines.style.position = "absolute";
connectionLines.style.top = 0;
connectionLines.style.left = 0;
connectionLines.style.width = "100%";
connectionLines.style.height = "100%";
connectionLines.style.pointerEvents = "none";
container.insertBefore(connectionLines, container.firstChild); // Insert at beginning so particles are on top

const magnifierLines = document.createElementNS("http://www.w3.org/2000/svg", "svg");
magnifierLines.setAttribute("id", "magnifierLines");
magnifierLines.style.position = "absolute";
magnifierLines.style.top = 0;
magnifierLines.style.left = 0;
magnifierLines.style.width = "100%";
magnifierLines.style.height = "100%";
magnifierLines.style.pointerEvents = "none";
if (magnifier && magnifierInner) {
    // Insert inside magnifierInner so lines are part of the same transform
    magnifierInner.appendChild(magnifierLines);
}

function updateConnectionLines() {
    // clear previous lines
    connectionLines.innerHTML = "";
    if (magnifierLines) magnifierLines.innerHTML = "";

    // only draw for solid or liquid
    if (currentState !== "solid" && currentState !== "liquid") return;

    const maxDist = 50; // max distance to connect
    const maxDistSq = maxDist * maxDist;
    const isMagnifierVisible = magnifier && !magnifier.classList.contains('hidden');

    for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        // Find nearest 3 neighbors within maxDist
        let neighbors = [];
        for (let j = 0; j < particles.length; j++) {
            if (i === j) continue;
            const p2 = particles[j];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const d2 = dx * dx + dy * dy;
            if (d2 <= maxDistSq) {
                neighbors.push({p2, d2});
            }
        }
        neighbors.sort((a, b) => a.d2 - b.d2);
        for (let n = 0; n < Math.min(3, neighbors.length); n++) {
            const p2 = neighbors[n].p2;
            // Avoid double-drawing
            if (particles.indexOf(p2) < i) continue;
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", p1.x);
            line.setAttribute("y1", p1.y);
            line.setAttribute("x2", p2.x);
            line.setAttribute("y2", p2.y);
            line.setAttribute("stroke", stateColors[currentState]);
            line.setAttribute("stroke-opacity", 0.3);
            line.setAttribute("stroke-width", 1);
            connectionLines.appendChild(line);

            // magnifier line (only if visible)
            if (isMagnifierVisible && p1._clone && p2._clone && magnifierLines) {
                // Use the clone's position for magnified lines
                const mLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
                mLine.setAttribute("x1", parseFloat(p1._clone.style.left) || p1.x);
                mLine.setAttribute("y1", parseFloat(p1._clone.style.top) || p1.y);
                mLine.setAttribute("x2", parseFloat(p2._clone.style.left) || p2.x);
                mLine.setAttribute("y2", parseFloat(p2._clone.style.top) || p2.y);
                mLine.setAttribute("stroke", stateColors[currentState]);
                mLine.setAttribute("stroke-opacity", 0.4);
                mLine.setAttribute("stroke-width", 1);
                magnifierLines.appendChild(mLine);
            }
        }
    }
}

// Call this in your animation loop
// drawConnectionLines() (old version removed) — see the bottom definition
function animate() {
    // eased speed change but without the ease
    if (targetTransition) {
        const targetSpeed = stateSpeeds[targetTransition.to];
        speed += (targetSpeed - speed) * 0.02; 
    }

    // Rebuild spatial grid
    spatialGrid = {};
    particles.forEach(p => {
        const gridX = Math.floor(p.x / GRID_SIZE);
        const gridY = Math.floor(p.y / GRID_SIZE);
        const cellKey = gridX + ',' + gridY;
        if (!spatialGrid[cellKey]) spatialGrid[cellKey] = [];
        spatialGrid[cellKey].push(p);
    });

    particles.forEach((p, index) => {
        // damping - particles lose energy (velocity reduces over time)
        p.vx *= 0.95;
        p.vy *= 0.95;
        
        // attraction toward center (using cached dimensions)
        const cx = containerWidth * 0.5;
        const cy = containerHeight * 0.5;
        const dxC = cx - p.x;
        const dyC = cy - p.y;
        // small coefficients tuned to produce vibrations
        if (currentState === "solid") {
            // stronger pull to center for solids to keep them more tightly bound
            const k = 0.00036;
            p.vx += dxC * k;
            p.vy += dyC * k;
        } else if (currentState === "liquid") {
            // weaker pull for liquids
            const k = 0.00012;
            p.vx += dxC * k;
            p.vy += dyC * k;
        }
        
        // particle motion (reduced random calls for performance)
        if (Math.random() < 0.5) {
            p.vx += (Math.random() - 0.5) * speed * 0.5;
            p.vy += (Math.random() - 0.5) * speed * 0.5;
        }
        p.x += p.vx;
        p.y += p.vy;

        // simple short-range separation to prevent overlap (collision resolution with spatial grid)
        const minDist = 12; // minimum allowed distance between particle centers
        const minDistSq = minDist * minDist;
        
        // Use spatial grid to reduce collision checks
        const gridX = Math.floor(p.x / GRID_SIZE);
        const gridY = Math.floor(p.y / GRID_SIZE);
        const checkCells = [
            [gridX - 1, gridY - 1], [gridX, gridY - 1], [gridX + 1, gridY - 1],
            [gridX - 1, gridY],     [gridX, gridY],     [gridX + 1, gridY],
            [gridX - 1, gridY + 1], [gridX, gridY + 1], [gridX + 1, gridY + 1]
        ];
        
        for (const [cx, cy] of checkCells) {
            const cellKey = cx + ',' + cy;
            const cellParticles = spatialGrid[cellKey] || [];
            for (const other of cellParticles) {
                if (other === p) continue;
                let dx = other.x - p.x;
                let dy = other.y - p.y;
                let d2 = dx * dx + dy * dy;
                if (d2 > 0 && d2 < minDistSq) {
                    let d = Math.sqrt(d2) || 0.0001;
                    let overlap = (minDist - d) / 2;
                    let nx = dx / d;
                    let ny = dy / d;
                    // push each particle away along the normal
                    p.x -= nx * overlap;
                    p.y -= ny * overlap;
                    other.x += nx * overlap;
                    other.y += ny * overlap;
                    // reduce velocities slightly to avoid explosion
                    p.vx *= 0.85; p.vy *= 0.85;
                    other.vx *= 0.85; other.vy *= 0.85;
                }
            }
        }

        // update individual particle energy based on current state speed
        p.energy = p.energy * 0.95 + (speed / 5) * 0.05;
        // only update opacity if energy changed significantly (avoid DOM thrashing)
        if (Math.abs(p.energy - p.lastEnergy) > 0.02) {
            p.element.style.opacity = 0.6 + (p.energy * 0.4);
            p.lastEnergy = p.energy;
        }

        // bounce physics
        if (p.x < 0 || p.x > containerWidth - 12) p.vx *= -1;
        if (p.y < 0 || p.y > containerHeight - 12) p.vy *= -1;

        // Use GPU-accelerated transform instead of left/top (much faster)
        p.element.style.transform = `translate(${p.x}px, ${p.y}px)`;
    });

    bondFrameSkip++;
    if (bondFrameSkip % 1 === 0) {
        updateConnectionLines(); // update bonds every frame
    }

    if (targetTransition && Math.abs(speed - stateSpeeds[targetTransition.to]) < 0.05) {
        currentState = targetTransition.to;
        targetTransition = null;
        speed = stateSpeeds[currentState]; // reset speed to current state
        updateParticleColors();
        energyInfo.textContent = "Energy: " + stateEnergy[currentState];
        motionInfo.textContent = "Motion: " + stateMotion[currentState];
        attractionInfo.textContent = "Attraction: " + stateAttraction[currentState];
    }

    requestAnimationFrame(animateWrapper);
}

    // Update magnifier mirrored clones each frame
    let lastCloneColor = stateColors[currentState];
    function updateMagnifier() {
        if (!magnifier || !magnifierInner) return;
        const isMagnifierVisible = !magnifier.classList.contains('hidden');
        
        // only update clones if magnifier is visible (huge performance gain)
        if (isMagnifierVisible) {
            const transform = `translate(${magnifierRadius - magnifierPos.x * magnifierZoom}px, ${magnifierRadius - magnifierPos.y * magnifierZoom}px) scale(${magnifierZoom})`;
            magnifierInner.style.transform = transform;
            
            const newColor = stateColors[currentState];
            const colorChanged = newColor !== lastCloneColor;
            if (colorChanged) lastCloneColor = newColor;
            
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (p._clone) {
                    p._clone.style.transform = `translate(${p.x}px, ${p.y}px)`;
                    if (colorChanged) p._clone.style.background = newColor;
                }
            }
        }
        
        const mask = document.getElementById('maskCircle');
        if (mask) {
            mask.style.left = magnifierPos.x + 'px';
            mask.style.top = magnifierPos.y + 'px';
            mask.style.width = (magnifierRadius * 2) + 'px';
            mask.style.height = (magnifierRadius * 2) + 'px';
            if (isMagnifierVisible) mask.classList.remove('hidden');
        }
    }

    // call updateMagnifier from animation loop by wrapping animate
    const _origAnimate = animate;

    function animateWrapper() {
        _origAnimate();
        updateMagnifier();
    }

    // start wrapper instead
    requestAnimationFrame(animateWrapper);
function updateParticleColors() {
    const color = stateColors[currentState];
    particles.forEach(p => {
        p.element.style.background = color;
        if (p._clone) p._clone.style.background = color;
    });
    updateButtons(currentState);
}

// Ensure buttons reflect initial state
updateButtons(currentState);