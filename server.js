// 08 ox game\ox game_250628_02\server.js
// server.js

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const config = require('./config.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname + '/public'));

const rooms = new Map();

function generateRoomId() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

function mapToObject(map) { 
    const obj = {}; 
    for (let [k, v] of map.entries()) { 
        obj[k] = v instanceof Map ? mapToObject(v) : v; 
    } 
    return obj; 
}

function broadcastGameState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const { correctAnswer, ...questionForClient } = room.currentQuestion || {};
    
    const gameState = {
        roomId, 
        ownerId: room.ownerId, 
        players: mapToObject(room.players),
        gameState: room.gameState, 
        currentQuestion: room.currentQuestion ? questionForClient : null,
        isRevival: room.isRevival
    };

    io.to(roomId).emit('game state update', gameState);
}

io.on('connection', (socket) => {
    
    socket.emit('server config', config);

    socket.on('get room info', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) {
            return socket.emit('error message', '존재하지 않는 방입니다.');
        }
        const streamersInRoom = Array.from(room.players.values()).filter(p => p.role === 'streamer');
        socket.emit('room info response', { streamersInRoom });
    });

    socket.on('create room', (userData) => {
        if (userData.role !== 'streamer') {
            return socket.emit('error message', '방은 스트리머만 만들 수 있습니다.');
        }
        if (userData.streamerKey !== 'mhyam3') {
            return socket.emit('error message', '스트리머 인증 키가 올바르지 않습니다.');
        }

        const roomId = generateRoomId();
        socket.join(roomId);
        
        const { streamerKey, ...safeUserData } = userData;
        socket.userData = { ...safeUserData, id: socket.id };
        socket.roomId = roomId;

        rooms.set(roomId, {
            ownerId: socket.id, 
            players: new Map([[socket.id, { ...socket.userData, status: 'active', answer: null }]]),
            gameState: 'lobby', 
            currentQuestion: null, 
            isRevival: false,
            roundTimer: null, 
            currentQuestionerId: null
        });

        broadcastGameState(roomId);
    });

    socket.on('join room', (data) => {
        const { roomId, userData } = data;
        const room = rooms.get(roomId);

        if (!room) {
            return socket.emit('error message', '존재하지 않는 방입니다.');
        }
        if (userData.role === 'streamer' && userData.streamerKey !== 'mhyam3') {
            return socket.emit('error message', '스트리머 인증 키가 올바르지 않습니다.');
        }
        if (userData.role === 'fan') {
            if (!userData.fanGroup) {
                return socket.emit('error message', '팬덤 정보가 없습니다.');
            }
            const streamerConfig = config.streamers.find(s => s.fandom.id === userData.fanGroup);
            if (!streamerConfig) {
                return socket.emit('error message', '선택한 팬덤 정보를 찾을 수 없습니다.');
            }
            
            userData.pfp = streamerConfig.fandom.pfp;
            userData.color = streamerConfig.color;
            userData.textColor = streamerConfig.textColor;
        }

        socket.join(roomId);

        const { streamerKey, ...safeUserData } = userData;
        socket.userData = { ...safeUserData, id: socket.id };
        socket.roomId = roomId;

        room.players.set(socket.id, { ...socket.userData, status: 'active', answer: null });
        
        broadcastGameState(roomId);
    });

    socket.on('designate questioner', ({ questionerId, isRevival }) => {
        const room = rooms.get(socket.roomId);
        if (!room || socket.id !== room.ownerId) return; 

        room.currentQuestionerId = questionerId;
        room.isRevival = isRevival; 
        
        const questioner = room.players.get(questionerId);
        if (questioner) {
            io.to(questionerId).emit('your turn to question', { isRevival });
            io.to(socket.roomId).except(questionerId).emit('game message', `${questioner.nickname}님이 문제를 출제합니다...`);
        }
    });
    
    const startRound = (roomId, questionData) => {
        const room = rooms.get(roomId);
        if (!room || socket.id !== room.currentQuestionerId) return;

        if (room.roundTimer) clearTimeout(room.roundTimer);

        room.currentQuestion = { ...questionData, startTime: Date.now() };
        room.gameState = 'question';

        (room.isRevival ? Array.from(room.players.values()).filter(p => p.status === 'eliminated') : Array.from(room.players.values()))
            .forEach(player => player.answer = null);
        
        broadcastGameState(roomId);
        
        room.roundTimer = setTimeout(() => endRoundLogic(roomId), questionData.duration * 1000);
    };

    socket.on('new question', (questionData) => startRound(socket.roomId, questionData));

    socket.on('submit answer', (answerIndex) => {
        const room = rooms.get(socket.roomId);
        if (!room || room.gameState !== 'question') return;

        const player = room.players.get(socket.id);
        if (!player) return;
        
        const canSubmit = (room.isRevival && player.status === 'eliminated') || (!room.isRevival && player.status === 'active');
        if (canSubmit) { 
            player.answer = answerIndex; 
            io.to(socket.roomId).emit('player moved', { playerId: socket.id, answerIndex }); 
        }
    });
    
    socket.on('express emotion', (emoji) => {
        const room = rooms.get(socket.roomId);
        if (!room || !room.players.has(socket.id)) return;
        
        io.to(socket.roomId).emit('emotion expressed', { 
            playerId: socket.id, 
            emoji: emoji 
        });
    });

    const endRoundLogic = (roomId) => {
        const room = rooms.get(roomId);
        if (!room || !room.currentQuestion) return;

        if (room.roundTimer) { 
            clearTimeout(room.roundTimer); 
            room.roundTimer = null; 
        }

        room.gameState = 'judging';
        const correctAnswer = room.currentQuestion.correctAnswer;
        let activeFans = [];

        if (room.isRevival) {
            room.players.forEach(p => { 
                if (p.status === 'eliminated' && p.answer == correctAnswer) p.status = 'active'; 
            });
            activeFans = Array.from(room.players.values()).filter(p => p.role === 'fan' && p.status === 'active');
        } else {
            room.players.forEach(p => { 
                if (p.role === 'fan' && p.status === 'active' && p.answer != correctAnswer) p.status = 'eliminated'; 
            });
            activeFans = Array.from(room.players.values()).filter(p => p.role === 'fan' && p.status === 'active');
        }

        if (!room.isRevival && activeFans.length <= 1) {
            room.gameState = 'finished';
        }

        io.to(roomId).emit('round result', { players: mapToObject(room.players), correctAnswer, isRevival: room.isRevival, gameState: room.gameState });
        
        room.isRevival = false; 
        room.currentQuestionerId = null; 
    };

    socket.on('end round', () => endRoundLogic(socket.roomId));
    
    socket.on('reset game', () => {
        const room = rooms.get(socket.roomId);
        if (!room || room.players.get(socket.id)?.role !== 'streamer') return;

        if(room.roundTimer) clearTimeout(room.roundTimer);

        room.gameState = 'lobby'; 
        room.currentQuestion = null; 
        room.isRevival = false; 
        room.roundTimer = null; 
        room.currentQuestionerId = null;

        room.players.forEach(p => { 
            p.status = 'active'; 
            p.answer = null; 
        });
        
        broadcastGameState(socket.roomId);
    });
    
    socket.on('kick player', (playerId) => {
        const room = rooms.get(socket.roomId);
        if (!room || room.players.get(socket.id)?.role !== 'streamer') return;

        const targetSocket = io.sockets.sockets.get(playerId);
        if (targetSocket) { 
            targetSocket.emit('error message', '방에서 강퇴당했습니다.'); 
            targetSocket.leave(socket.roomId); 
        }
        
        room.players.delete(playerId);
        
        broadcastGameState(socket.roomId);
    });

    socket.on('disconnect', () => {
        const room = rooms.get(socket.roomId);
        if (room) {
            if (socket.id === room.ownerId) {
                if (room.roundTimer) clearTimeout(room.roundTimer);
                io.to(socket.roomId).emit('error message', '방장이 나가서 방이 종료되었습니다.');
                rooms.delete(socket.roomId);
            } else {
                room.players.delete(socket.id);
                broadcastGameState(socket.roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));