"use strict";

const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");
const express = require("express");

// ============================================================
// EXPRESS SERVER - Live Monitoring Interface
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

let botState = { connected: false };

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>antgamer6969 Dashboard</title>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; background: #0d1117; color: #e6edf3; text-align: center; padding: 50px; }
          .card { background: #161b22; padding: 30px; border-radius: 10px; display: inline-block; border: 1px solid #21262d; }
          h1 { color: #58a6ff; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>antgamer6969 Ultimate PvP Bot</h1>
          <p>Status: ONLINE</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: botState.connected ? 'connected' : 'disconnected' });
});

app.listen(PORT, () => {
  console.log("Web monitoring dashboard online");
});

// ============================================================
// MINECRAFT BOT ENGINE + ADVANCED COMBAT CORE
// ============================================================
let bot;
let grudgeTargetName = null;  // Used for player grudges
let activeMonsterTarget = null; // Used for mob targeting
let pvpLoopInterval = null;
let homePosition = null;

function createBot() {
  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: config["bot-account"].username,
    version: config.server.version,
    auth: config["bot-account"].type
  });

  bot.loadPlugin(pathfinder);

  bot.on('spawn', () => {
    botState.connected = true;
    console.log("Bot spawned into world successfully.");
    
    if (!homePosition) {
      homePosition = bot.entity.position.clone();
      console.log("Home position locked.");
    } else {
      setTimeout(() => {
        bot.chat("Returning to my base coordinates! 🏃‍♂️");
        const movements = new Movements(bot);
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(new GoalBlock(homePosition.x, homePosition.y, homePosition.z));
      }, 2000);
    }
    
    // Equipment update checks
    setInterval(() => {
      if (!bot || !bot.inventory) return;
      const items = bot.inventory.items();
      
      const sword = items.find(item => item.name.includes('sword'));
      if (sword) bot.equip(sword, 'hand').catch(() => {});
      
      const helmet = items.find(item => item.name.includes('helmet'));
      if (helmet) bot.equip(helmet, 'head').catch(() => {});
      
      const chestplate = items.find(item => item.name.includes('chestplate'));
      if (chestplate) bot.equip(chestplate, 'torso').catch(() => {});
      
      const leggings = items.find(item => item.name.includes('leggings'));
      if (leggings) bot.equip(leggings, 'legs').catch(() => {});
      
      const boots = items.find(item => item.name.includes('boots'));
      if (boots) bot.equip(boots, 'feet').catch(() => {});
    }, 3000);
  });

  // INSTANT WELCOME MESSAGE ON PLAYER JOIN
  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return;
    bot.chat("Hi " + player.username + ", Make sure to subscribe to antgamer6969!");
  });

  bot.on('health', () => {
    const baselineDifference = 12 - bot.health;
    const foodDifference = 20 - bot.food;
    
    if (baselineDifference > 0 && foodDifference > 0) {
      const bread = bot.inventory.items().find(item => item.name === 'bread');
      if (bread) {
        bot.equip(bread, 'hand')
          .then(() => bot.consume())
          .catch(err => console.log("Eating error: ", err));
      }
    }
  });

  bot.on('death', () => {
    bot.chat("Mai Har Gaya");
    stopPvP(); 
  });

  bot.on('playerDeath', (player) => {
    if (grudgeTargetName && player.username === grudgeTargetName) {
      bot.chat("Bola tha na,Masti nahi");
    }
  });

  // Main combat check loops
  function startCombatLoop() {
    if (pvpLoopInterval) clearInterval(pvpLoopInterval);

    pvpLoopInterval = setInterval(() => {
      let currentTargetEntity = null;

      // Prioritize fighting back players if a player grudge exists
      if (grudgeTargetName && bot.players[grudgeTargetName]) {
        currentTargetEntity = bot.players[grudgeTargetName].entity;
      } else if (activeMonsterTarget) {
        currentTargetEntity = activeMonsterTarget;
      }

      // If no valid target is found or loaded, safely rest combat engines
      if (!currentTargetEntity || !currentTargetEntity.isValid) {
        if (activeMonsterTarget) {
          activeMonsterTarget = null;
          bot.pathfinder.setGoal(null);
        }
        if (!grudgeTargetName) {
          stopPvP();
        }
        return;
      }

      const currentDistance = bot.entity.position.distanceTo(currentTargetEntity.position);
      
      const farCheckValue = currentDistance - 3;
      if (Math.max(0, farCheckValue) > 0) {
        const movements = new Movements(bot);
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(new GoalBlock(currentTargetEntity.position.x, currentTargetEntity.position.y, currentTargetEntity.position.z));
      }

      const closeCheckValue = 4 - currentDistance;
      if (Math.max(0, closeCheckValue) >= 0) {
        bot.lookAt(currentTargetEntity.position.offset(0, currentTargetEntity.height, 0));
        bot.attack(currentTargetEntity);
      }
    }, 300);
  }

  // ADVANCED SMART REVENGE ENGINE
  bot.on('entityHurt', (entity) => {
    if (entity.username !== bot.username) return;

    // Check if the closest threat within 6 blocks is a monster or player
    const nearestEnemy = bot.nearestEntity((e) => e.username !== bot.username && (e.type === 'player' || e.type === 'hostile' || e.type === 'mob'));
    
    if (nearestEnemy) {
      if (nearestEnemy.type === 'player') {
        // Handle Player Attack
        if (!grudgeTargetName) {
          grudgeTargetName = nearestEnemy.username;
          bot.chat("Beta " + nearestEnemy.username + ", Masti nahi");
          startCombatLoop();
        }
      } else {
        // Handle Monster Attack (Stays silent, just locks and fights back)
        if (!activeMonsterTarget && !grudgeTargetName) {
          activeMonsterTarget = nearestEnemy;
          startCombatLoop();
        }
      }
    }
  });

  function stopPvP() {
    if (pvpLoopInterval) {
      clearInterval(pvpLoopInterval);
      pvpLoopInterval = null;
    }
    grudgeTargetName = null;
    activeMonsterTarget = null;
    if (bot && bot.pathfinder) {
      bot.pathfinder.setGoal(null); 
    }
  }

  bot.on('chat', async (username, message) => {
    if (username === bot.username) return;
    const lowerMessage = message.toLowerCase();

    if (lowerMessage === 'hi') {
      bot.chat("Hello, " + username + "! Make sure to subscribe to antgamer6969!");
    }

    if (lowerMessage === '!come') {
      try {
        stopPvP(); 
        const playerFilter = bot.players[username];
        if (!playerFilter || !playerFilter.entity) {
          bot.chat("I can't see you, " + username + "! Get closer.");
          return;
        }
        bot.chat("Walking to you now, " + username + "!");
        const target = playerFilter.entity;
        const movements = new Movements(bot);
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(new GoalBlock(target.position.x, target.position.y, target.position.z));
      } catch (err) {
        console.log(err);
      }
    }

    if (lowerMessage === '!sethome') {
      homePosition = bot.entity.position.clone();
      bot.chat("New home point locked at my current feet coordinates!");
    }

    if (lowerMessage === '!empty') {
      try {
        bot.chat("Emptying inventory!");
        const items = bot.inventory.items();
        for (const item of items) {
          await bot.tossStack(item);
        }
      } catch (err) {
        console.log(err);
      }
    }

    if (lowerMessage === '!stop') {
      try {
        stopPvP();
        bot.chat("Tasks stopped. Free movement restored.");
      } catch (err) {
        console.log(err);
      }
    }
  });

  bot.on('end', () => {
    botState.connected = false;
    if (pvpLoopInterval) clearInterval(pvpLoopInterval);
    grudgeTargetName = null;
    activeMonsterTarget = null;
    console.log("Reconnecting in 5 seconds...");
    setTimeout(createBot, 5000);
  });
}

createBot();
