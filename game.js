(function() {
    'use strict';

    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const lanternsDisplay = document.getElementById('lanterns-display');
    const livesDisplay = document.getElementById('lives-display');

    function resizeCanvas() {
        const max = Math.min(window.innerWidth - 24, window.innerHeight - 24);
        canvas.width = max;
        canvas.height = max;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    function C() {
        const w = canvas.width, h = canvas.height;
        return {
            W: w, H: h,
            GRAVITY: w * 0.7,
            JUMP_POWER: -(w * 0.56),
            MOVE_SPEED: w * 0.4,
            EMBER_R: w * 0.026,
            LANTERN_R: w * 0.033,
            BRICK: w * 0.05,
            CORRIDOR_H: h * 0.5,
            WALL_H: h * 0.24,
            TOP_BASE: h * 0.04,
        };
    }

    function buildLevel() {
        const c = C();
        const brick = c.BRICK;
        const topBase = c.TOP_BASE;
        const topY = topBase + c.WALL_H;
        const botBase = topY + c.CORRIDOR_H;
        const segW = brick * 7;
        const segments = [];
        const total = 15;

        for (let i = 0; i < total; i++) {
            let topOff = 0, botOff = 0;
            if (i === 0 || i === total - 1) { topOff = 0; botOff = 0; }
            else {
                const p = i % 6;
                if (p === 0) { topOff = brick * 3.5; botOff = 0; }
                else if (p === 1) { topOff = 0; botOff = brick * 3.5; }
                else if (p === 2) { topOff = brick * 2; botOff = brick * 2; }
                else if (p === 3) { topOff = -brick * 2; botOff = -brick * 2; }
                else if (p === 4) { topOff = brick * 1.5; botOff = -brick * 1.5; }
                else { topOff = -brick * 1; botOff = brick * 3; }
            }
            segments.push({ x: i * segW, w: segW, topY: topY + topOff, botY: botBase - botOff });
        }

        const lanterns = [];
        for (let i = 1; i < total - 1; i++) {
            const seg = segments[i];
            lanterns.push({
                x: seg.x + segW * (0.35 + Math.random() * 0.3),
                y: topY + c.CORRIDOR_H * (0.25 + Math.random() * 0.5),
                lit: false, baseY: topY + c.CORRIDOR_H / 2,
                floatOffset: Math.random() * Math.PI * 2,
            });
        }

        const stalactites = [];
        for (let i = 1; i < total - 1; i += 3) {
            const seg = segments[i];
            stalactites.push({
                x: seg.x + segW * 0.5,
                anchorY: seg.topY,
                length: c.CORRIDOR_H * 0.3,
                fallen: false,
                fallTimer: 0,
                triggerX: seg.x + segW * 0.4,
            });
        }

        const vents = [];
        for (let i = 2; i < total - 1; i += 3) {
            const seg = segments[i];
            vents.push({
                x: seg.x + segW * 0.4,
                y: seg.botY,
                width: brick * 1.2,
                height: brick * 0.8,
                active: true,
                timer: Math.random() * 2,
                interval: 2 + Math.random() * 2,
            });
        }

        const markers = [];
        const markerConfigs = [
            { segIdx: 2, yOffset: 1.2 },
            { segIdx: 5, yOffset: 8.5 },
            { segIdx: 8, yOffset: 1.2 },
            { segIdx: 11, yOffset: 8.5 },
        ];
        
        for (const config of markerConfigs) {
            if (config.segIdx >= total - 1) continue;
            const seg = segments[config.segIdx];
            markers.push({
                x: seg.x + seg.w * 0.5,
                y: botBase - brick * config.yOffset,
                radius: c.EMBER_R * 1.8,
                activated: false,
            });
        }

        const last = segments[total - 1];
        const gate = {
            x: last.x + segW * 0.6,
            y: topY + c.CORRIDOR_H / 2 - c.H * 0.07,
            w: brick * 1.5,
            h: c.H * 0.14,
            open: false,
        };

        return { segments, lanterns, stalactites, vents, markers, gate, totalW: total * segW, topBase, topY, botBase };
    }

    let c, level, gameState, cameraX;

    function init() {
        c = C();
        level = buildLevel();
        cameraX = 0;
        gameState = {
            isRunning: false, isGameOver: false, isAtStartScreen: true,
            lanternsLit: 0, totalLanterns: level.lanterns.length,
            lives: 3, invincibleTimer: 0,
            lastCheckpointX: c.W * 0.07,
            lastCheckpointY: level.topY + c.CORRIDOR_H / 2,
            ember: {
                x: c.W * 0.07,
                y: level.topY + c.CORRIDOR_H / 2,
                vx: 0, vy: 0, radius: c.EMBER_R,
                trail: [],
            },
            keys: { ArrowLeft: false, ArrowRight: false, ArrowUp: false },
        };
    }

    function kd(e) {
        if (e.key === 'ArrowLeft') { gameState.keys.ArrowLeft = true; e.preventDefault(); }
        else if (e.key === 'ArrowRight') { gameState.keys.ArrowRight = true; e.preventDefault(); }
        else if (e.key === 'ArrowUp') { gameState.keys.ArrowUp = true; e.preventDefault(); }
        else if (e.key === ' ' || e.key === 'Space') {
            e.preventDefault();
            if (gameState.isAtStartScreen) startGame();
            else if (gameState.isGameOver) restartGame();
        }
    }
    function ku(e) {
        if (e.key === 'ArrowLeft') { gameState.keys.ArrowLeft = false; e.preventDefault(); }
        else if (e.key === 'ArrowRight') { gameState.keys.ArrowRight = false; e.preventDefault(); }
        else if (e.key === 'ArrowUp') { gameState.keys.ArrowUp = false; e.preventDefault(); }
    }
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    function topYAt(x) {
        for (const s of level.segments) if (x >= s.x && x < s.x + s.w) return s.topY;
        return level.topY;
    }
    function botYAt(x) {
        for (const s of level.segments) if (x >= s.x && x < s.x + s.w) return s.botY;
        return level.botBase;
    }

    function circleRect(cx, cy, r, rx, ry, rw, rh) {
        const nearX = Math.max(rx, Math.min(cx, rx + rw));
        const nearY = Math.max(ry, Math.min(cy, ry + rh));
        return Math.hypot(cx - nearX, cy - nearY) < r;
    }

    function emberHitsLantern(ember, lantern) {
        if (lantern.lit) return false;
        return Math.hypot(ember.x - lantern.x, ember.y - lantern.y) < ember.radius + c.LANTERN_R;
    }

    function hurtEmber() {
        if (gameState.invincibleTimer > 0) return;
        gameState.lives--;
        if (gameState.lives <= 0) {
            gameState.isRunning = false;
            gameState.isGameOver = true;
        } else {
            gameState.ember.x = gameState.lastCheckpointX;
            gameState.ember.y = gameState.lastCheckpointY;
            gameState.ember.vx = 0; gameState.ember.vy = 0;
            gameState.ember.trail = [];
            gameState.invincibleTimer = 1.8;
        }
    }

    function update(dt) {
        if (!gameState.isRunning) return;
        const ember = gameState.ember;

        if (gameState.invincibleTimer > 0) gameState.invincibleTimer -= dt;

        let move = 0;
        if (gameState.keys.ArrowLeft) move = -1;
        if (gameState.keys.ArrowRight) move = 1;
        ember.vx = move * c.MOVE_SPEED;

        const curBot = botYAt(ember.x);
        if (gameState.keys.ArrowUp && ember.y + ember.radius >= curBot - 3) {
            ember.vy = c.JUMP_POWER;
        }

        ember.vy += c.GRAVITY * dt;
        ember.x += ember.vx * dt;
        ember.y += ember.vy * dt;

        ember.trail.push({ x: ember.x, y: ember.y, life: 0.4 });
        for (const t of ember.trail) t.life -= dt;
        ember.trail = ember.trail.filter(t => t.life > 0);

        const curTop = topYAt(ember.x);
        if (ember.y - ember.radius < curTop) { ember.y = curTop + ember.radius; ember.vy = Math.abs(ember.vy) * 0.25; }
        if (ember.y + ember.radius > curBot) {
            ember.y = curBot - ember.radius;
            ember.vy = 0;
        }
        if (ember.x - ember.radius < 0) { ember.x = ember.radius; ember.vx = 0; }
        if (ember.x + ember.radius > level.totalW - 10) { ember.x = level.totalW - 10 - ember.radius; ember.vx = 0; }

        for (const lantern of level.lanterns) {
            lantern.floatOffset += dt * 0.8;
            lantern.y = lantern.baseY + Math.sin(lantern.floatOffset) * c.CORRIDOR_H * 0.06;
            if (emberHitsLantern(ember, lantern)) {
                lantern.lit = true;
                gameState.lanternsLit++;
            }
        }

        for (const stal of level.stalactites) {
            if (!stal.fallen && ember.x > stal.triggerX && ember.x < stal.triggerX + 60) {
                stal.fallen = true;
                stal.fallTimer = 0;
            }
            if (stal.fallen) {
                stal.fallTimer += dt;
                const dropAmount = Math.min(stal.length, stal.fallTimer * c.CORRIDOR_H * 1.2);
                const tipY = stal.anchorY + dropAmount;
                if (Math.hypot(ember.x - stal.x, ember.y - tipY) < ember.radius + c.BRICK * 0.5) {
                    hurtEmber();
                }
            }
        }

        for (const vent of level.vents) {
            vent.timer += dt;
            if (vent.timer >= vent.interval) {
                vent.active = !vent.active;
                vent.timer = 0;
            }
            if (vent.active && circleRect(ember.x, ember.y, ember.radius, vent.x - 10, vent.y - 15, vent.width + 20, vent.height + 15)) {
                ember.vx += (Math.random() - 0.5) * c.MOVE_SPEED * 1.5;
                ember.vy -= c.JUMP_POWER * 0.3;
            }
        }

        for (const marker of level.markers) {
            if (!marker.activated && Math.hypot(ember.x - marker.x, ember.y - marker.y) < marker.radius + ember.radius) {
                marker.activated = true;
                gameState.lastCheckpointX = marker.x;
                gameState.lastCheckpointY = marker.y;
            }
        }

        if (gameState.lanternsLit >= gameState.totalLanterns) level.gate.open = true;
        if (level.gate.open && circleRect(ember.x, ember.y, ember.radius, level.gate.x, level.gate.y, level.gate.w, level.gate.h)) {
            gameState.isRunning = false; gameState.isGameOver = true;
        }

        cameraX = Math.max(0, Math.min(ember.x - c.W * 0.35, level.totalW - c.W));

        lanternsDisplay.textContent = `LANTERNS: ${gameState.lanternsLit}/${gameState.totalLanterns}`;
        livesDisplay.textContent = `LIVES: ${gameState.lives}`;
    }

    function drawStoneWalls() {
        const brick = c.BRICK;
        const brickH = brick * 0.8;
        const stoneBody = '#2d2822';
        const stoneHighlight = '#3a342e';
        const stoneShadow = '#1f1b17';
        const mortarLine = 'rgba(0,0,0,0.18)';

        for (const seg of level.segments) {
            const sx = seg.x - cameraX;
            if (sx + seg.w < 0 || sx > c.W) continue;
            const totalHeight = seg.topY - level.topBase;
            const rows = Math.ceil(totalHeight / brickH);
            for (let row = 0; row < rows; row++) {
                const y = level.topBase + row * brickH;
                const h = Math.min(brickH, seg.topY - y);
                if (h <= 0) continue;
                ctx.fillStyle = stoneBody;
                ctx.fillRect(sx, y, seg.w, h);
                ctx.fillStyle = stoneHighlight;
                ctx.fillRect(sx, y, seg.w, Math.max(2, h * 0.25));
                ctx.fillStyle = stoneShadow;
                ctx.fillRect(sx, y + h - Math.max(2, h * 0.18), seg.w, Math.max(2, h * 0.18));
                ctx.fillStyle = mortarLine;
                ctx.fillRect(sx, y + h - 1, seg.w, 1);
                const offsetX = (row % 2) * brick * 0.5;
                for (let colX = seg.x - (seg.x % brick) + offsetX; colX < seg.x + seg.w; colX += brick) {
                    const lineX = colX - cameraX;
                    if (lineX > sx && lineX < sx + seg.w) {
                        ctx.fillStyle = mortarLine;
                        ctx.fillRect(lineX - 0.5, y, 1, h);
                    }
                }
            }
        }

        for (const seg of level.segments) {
            const sx = seg.x - cameraX;
            if (sx + seg.w < 0 || sx > c.W) continue;
            const totalHeight = c.H - seg.botY;
            const rows = Math.ceil(totalHeight / brickH);
            for (let row = 0; row < rows; row++) {
                const y = seg.botY + row * brickH;
                const h = Math.min(brickH, c.H - y);
                if (h <= 0) continue;
                ctx.fillStyle = stoneBody;
                ctx.fillRect(sx, y, seg.w, h);
                ctx.fillStyle = stoneHighlight;
                ctx.fillRect(sx, y, seg.w, Math.max(2, h * 0.25));
                ctx.fillStyle = stoneShadow;
                ctx.fillRect(sx, y + h - Math.max(2, h * 0.18), seg.w, Math.max(2, h * 0.18));
                ctx.fillStyle = mortarLine;
                ctx.fillRect(sx, y + h - 1, seg.w, 1);
                const offsetX = (row % 2) * brick * 0.5;
                for (let colX = seg.x - (seg.x % brick) + offsetX; colX < seg.x + seg.w; colX += brick) {
                    const lineX = colX - cameraX;
                    if (lineX > sx && lineX < sx + seg.w) {
                        ctx.fillStyle = mortarLine;
                        ctx.fillRect(lineX - 0.5, y, 1, h);
                    }
                }
            }
        }

        for (let i = 0; i < level.segments.length; i++) {
            const seg = level.segments[i];
            const sx = seg.x - cameraX;
            if (sx + seg.w < 0 || sx > c.W) continue;
            const defaultTop = level.topY;
            const defaultBot = level.botBase;
            if (seg.topY < defaultTop - 2) {
                ctx.fillStyle = '#0d0d18';
                ctx.fillRect(sx, seg.topY, seg.w, defaultTop - seg.topY);
            }
            if (seg.botY > defaultBot + 2) {
                ctx.fillStyle = '#0d0d18';
                ctx.fillRect(sx, defaultBot, seg.w, seg.botY - defaultBot);
            }
        }
    }

    function drawLanterns() {
        const r = c.LANTERN_R;
        for (const lantern of level.lanterns) {
            const sx = lantern.x - cameraX;
            if (sx + r < -10 || sx - r > c.W + 10) continue;
            if (lantern.lit) {
                const glow = ctx.createRadialGradient(sx, lantern.y, r * 0.3, sx, lantern.y, r * 1.8);
                glow.addColorStop(0, 'rgba(255, 180, 60, 0.5)');
                glow.addColorStop(0.5, 'rgba(255, 140, 20, 0.15)');
                glow.addColorStop(1, 'rgba(255, 100, 0, 0)');
                ctx.fillStyle = glow;
                ctx.beginPath(); ctx.arc(sx, lantern.y, r * 1.8, 0, Math.PI * 2); ctx.fill();
            }
            const ringColor = lantern.lit ? '#ffbb44' : '#665544';
            ctx.fillStyle = lantern.lit ? 'rgba(255,180,60,0.12)' : 'rgba(100,80,50,0.06)';
            ctx.beginPath(); ctx.arc(sx, lantern.y, r + 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = ringColor;
            ctx.beginPath(); ctx.arc(sx, lantern.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#0d0d18';
            ctx.beginPath(); ctx.arc(sx, lantern.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = lantern.lit ? '#ff9930' : '#554433';
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(sx, lantern.y, r, 0, Math.PI * 2); ctx.stroke();
            if (lantern.lit) {
                ctx.fillStyle = 'rgba(255,255,220,0.5)';
                ctx.beginPath(); ctx.arc(sx - r * 0.2, lantern.y - r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    function drawStalactites() {
        for (const stal of level.stalactites) {
            const sx = stal.x - cameraX;
            if (sx < -30 || sx > c.W + 30) continue;
            const drop = stal.fallen ? Math.min(stal.length, stal.fallTimer * c.CORRIDOR_H * 1.2) : 0;
            const tipY = stal.anchorY + drop;
            ctx.fillStyle = '#3d3530';
            ctx.beginPath();
            ctx.moveTo(sx - 6, stal.anchorY);
            ctx.lineTo(sx + 6, stal.anchorY);
            ctx.lineTo(sx + 2, tipY);
            ctx.lineTo(sx - 2, tipY);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#2a2520';
            ctx.lineWidth = 1;
            ctx.stroke();
            if (!stal.fallen) {
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.beginPath(); ctx.arc(sx, tipY, 3, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    function drawVents() {
        for (const vent of level.vents) {
            const sx = vent.x - cameraX;
            if (sx + vent.width < 0 || sx > c.W) continue;
            if (vent.active) {
                ctx.fillStyle = 'rgba(200, 200, 210, 0.2)';
                for (let i = 0; i < 3; i++) {
                    const px = sx + vent.width * 0.3 + i * vent.width * 0.25;
                    const py = vent.y - 10 - Math.random() * 25;
                    ctx.beginPath(); ctx.arc(px, py, 4 + Math.random() * 6, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.fillStyle = '#1a1510';
            ctx.fillRect(sx, vent.y, vent.width, vent.height);
            ctx.fillStyle = vent.active ? '#444' : '#2a2520';
            ctx.fillRect(sx + 2, vent.y - 2, vent.width - 4, 3);
        }
    }

    function drawMarkers() {
        for (const marker of level.markers) {
            const sx = marker.x - cameraX;
            if (sx + marker.radius < 0 || sx - marker.radius > c.W) continue;

            if (!marker.activated) {
                const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.5;
                ctx.fillStyle = `rgba(255, 180, 100, ${pulse * 0.4})`;
                ctx.beginPath(); 
                ctx.arc(sx, marker.y, marker.radius * 1.8, 0, Math.PI * 2); 
                ctx.fill();
            }

            ctx.fillStyle = marker.activated ? '#5a5040' : '#3a3530';
            ctx.beginPath(); 
            ctx.arc(sx, marker.y, marker.radius, 0, Math.PI * 2); 
            ctx.fill();
            ctx.strokeStyle = marker.activated ? '#8a7a60' : '#4a4540';
            ctx.lineWidth = 2.5; 
            ctx.stroke();

            ctx.strokeStyle = marker.activated ? '#ffaa44' : '#5a5040';
            ctx.lineWidth = 1;
            ctx.beginPath(); 
            ctx.arc(sx, marker.y, marker.radius * 0.6, 0, Math.PI * 2); 
            ctx.stroke();

            if (marker.activated) {
                ctx.fillStyle = '#ffaa44';
                ctx.font = `${marker.radius * 1.2}px Georgia, serif`;
                ctx.textAlign = 'center';
                ctx.fillText('◆', sx, marker.y + marker.radius * 0.4);
            } else {
                ctx.fillStyle = '#665544';
                ctx.beginPath(); 
                ctx.arc(sx, marker.y, marker.radius * 0.3, 0, Math.PI * 2); 
                ctx.fill();
            }
        }
    }

    function drawGate() {
        const gate = level.gate;
        const sx = gate.x - cameraX;
        if (sx + gate.w < 0 || sx > c.W) return;
        ctx.fillStyle = '#2a2520';
        ctx.fillRect(sx - 8, gate.y - 10, gate.w + 16, gate.h + 20);
        ctx.fillStyle = '#3d3630';
        ctx.fillRect(sx - 6, gate.y - 8, gate.w + 12, gate.h + 16);
        ctx.fillStyle = gate.open ? '#1a1020' : '#0d0d18';
        ctx.fillRect(sx, gate.y, gate.w, gate.h);
        if (gate.open) {
            ctx.fillStyle = '#ffbb44';
            ctx.font = `${gate.w * 0.6}px Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.fillText('◈', sx + gate.w / 2, gate.y + gate.h / 2 + gate.w * 0.2);
        } else {
            ctx.fillStyle = '#554433';
            ctx.font = `${gate.w * 0.5}px Georgia, serif`;
            ctx.textAlign = 'center';
            ctx.fillText('◇', sx + gate.w / 2, gate.y + gate.h / 2 + gate.w * 0.15);
        }
    }

    function drawEmber() {
        const ember = gameState.ember;
        const sx = ember.x - cameraX;
        const sy = ember.y;
        if (gameState.invincibleTimer > 0 && Math.floor(gameState.invincibleTimer * 12) % 2 === 0) return;
        for (const t of ember.trail) {
            const alpha = t.life / 0.4;
            const r = ember.radius * (0.3 + alpha * 0.7);
            ctx.fillStyle = `rgba(255, 120, 20, ${alpha * 0.3})`;
            ctx.beginPath(); ctx.arc(t.x - cameraX, t.y, r, 0, Math.PI * 2); ctx.fill();
        }
        const by = botYAt(ember.x);
        const ss = Math.max(0.08, 1 - (by - (sy + ember.radius)) / (c.CORRIDOR_H * 0.3));
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(sx, by, ember.radius * ss, ember.radius * 0.18 * ss, 0, 0, Math.PI * 2); ctx.fill();
        const glow = ctx.createRadialGradient(sx, sy, ember.radius * 0.5, sx, sy, ember.radius * 2);
        glow.addColorStop(0, 'rgba(255, 160, 30, 0.35)');
        glow.addColorStop(1, 'rgba(255, 80, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(sx, sy, ember.radius * 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff6630';
        ctx.beginPath(); ctx.arc(sx, sy, ember.radius, 0, Math.PI * 2); ctx.fill();
        const heat = ctx.createRadialGradient(sx - ember.radius * 0.2, sy - ember.radius * 0.2, 0, sx, sy, ember.radius);
        heat.addColorStop(0, 'rgba(255, 255, 200, 0.7)');
        heat.addColorStop(0.4, 'rgba(255, 180, 40, 0.4)');
        heat.addColorStop(1, 'rgba(255, 60, 0, 0)');
        ctx.fillStyle = heat;
        ctx.beginPath(); ctx.arc(sx, sy, ember.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 240, 0.7)';
        ctx.beginPath(); ctx.arc(sx - ember.radius * 0.25, sy - ember.radius * 0.25, ember.radius * 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#cc3300';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, ember.radius, 0, Math.PI * 2); ctx.stroke();
    }

    function drawStartScreen() {
        ctx.fillStyle = 'rgba(8, 6, 4, 0.88)'; ctx.fillRect(0, 0, c.W, c.H);
        const cx = c.W / 2, cy = c.H / 2;
        ctx.fillStyle = '#ff8855';
        ctx.font = `${c.W * 0.06}px Georgia, serif`; ctx.textAlign = 'center';
        ctx.fillText('EMBER RUN', cx, cy - c.H * 0.12);
        ctx.strokeStyle = '#ff6630';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx - c.W * 0.2, cy - c.H * 0.09); ctx.lineTo(cx + c.W * 0.2, cy - c.H * 0.09); ctx.stroke();
        ctx.fillStyle = '#ccbbaa';
        ctx.font = `${c.W * 0.018}px Georgia, serif`;
        ctx.fillText('Light all lanterns to open the ancient gate', cx, cy - c.H * 0.03);
        ctx.fillText('← → Roll through the ruins   ↑ Bounce', cx, cy + c.H * 0.025);
        ctx.fillText('Touch stone markers to save your path', cx, cy + c.H * 0.06);
        ctx.fillStyle = '#ffaa55';
        ctx.font = `${c.W * 0.026}px Georgia, serif`;
        ctx.fillText('PRESS SPACE TO BEGIN', cx, cy + c.H * 0.13);
    }

    function drawGameOver() {
        ctx.fillStyle = 'rgba(8, 6, 4, 0.88)'; ctx.fillRect(0, 0, c.W, c.H);
        const cx = c.W / 2, cy = c.H / 2;
        const win = gameState.lanternsLit >= gameState.totalLanterns && level.gate.open;
        ctx.fillStyle = win ? '#ffaa44' : '#ff4422';
        ctx.font = `${c.W * 0.05}px Georgia, serif`; ctx.textAlign = 'center';
        ctx.fillText(win ? 'THE GATE OPENS' : 'EMBER FADES', cx, cy - c.H * 0.05);
        if (!win) {
            ctx.fillStyle = '#ccbbaa';
            ctx.font = `${c.W * 0.024}px Georgia, serif`;
            ctx.fillText(`Lanterns lit: ${gameState.lanternsLit}/${gameState.totalLanterns}`, cx, cy + c.H * 0.03);
        }
        ctx.fillStyle = '#ff8855';
        ctx.font = `${c.W * 0.02}px Georgia, serif`;
        ctx.fillText('PRESS SPACE TO TRY AGAIN', cx, cy + c.H * 0.11);
    }

    function render() {
        ctx.clearRect(0, 0, c.W, c.H);
        ctx.fillStyle = '#0d0d18'; ctx.fillRect(0, 0, c.W, c.H);
        drawStoneWalls();
        drawMarkers();
        drawVents();
        drawStalactites();
        drawLanterns();
        drawGate();
        drawEmber();
        if (gameState.isAtStartScreen) drawStartScreen();
        if (gameState.isGameOver) drawGameOver();
    }

    function startGame() {
        gameState.isAtStartScreen = false; gameState.isRunning = true; gameState.isGameOver = false;
        gameState.lanternsLit = 0; gameState.lives = 3; gameState.invincibleTimer = 0;
        gameState.lastCheckpointX = c.W * 0.07;
        gameState.lastCheckpointY = level.topY + c.CORRIDOR_H / 2;
        gameState.ember.x = c.W * 0.07; gameState.ember.y = level.topY + c.CORRIDOR_H / 2;
        gameState.ember.vx = 0; gameState.ember.vy = 0; gameState.ember.trail = []; cameraX = 0;
        for (const l of level.lanterns) l.lit = false;
        for (const m of level.markers) m.activated = false;
        for (const s of level.stalactites) { s.fallen = false; s.fallTimer = 0; }
        level.gate.open = false;
        lanternsDisplay.textContent = `LANTERNS: 0/${gameState.totalLanterns}`;
        livesDisplay.textContent = `LIVES: 3`;
    }

    function restartGame() {
        for (const l of level.lanterns) l.lit = false;
        for (const m of level.markers) m.activated = false;
        for (const s of level.stalactites) { s.fallen = false; s.fallTimer = 0; }
        level.gate.open = false;
        gameState.isGameOver = false; gameState.isRunning = false; gameState.isAtStartScreen = true;
        gameState.lanternsLit = 0; gameState.lives = 3; gameState.invincibleTimer = 0;
        gameState.lastCheckpointX = c.W * 0.07;
        gameState.lastCheckpointY = level.topY + c.CORRIDOR_H / 2;
        gameState.ember.x = c.W * 0.07; gameState.ember.y = level.topY + c.CORRIDOR_H / 2;
        gameState.ember.vx = 0; gameState.ember.vy = 0; gameState.ember.trail = []; cameraX = 0;
        lanternsDisplay.textContent = `LANTERNS: 0/${gameState.totalLanterns}`;
        livesDisplay.textContent = `LIVES: 3`;
    }

    let lastTime = 0;
    function loop(time) {
        const dt = Math.min(0.033, (time - lastTime) / 1000);
        if (dt > 0 && lastTime !== 0) update(dt);
        render();
        lastTime = time;
        requestAnimationFrame(loop);
    }

    init();
    requestAnimationFrame(loop);
})();