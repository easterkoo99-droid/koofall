const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const LOCATIONS = [
    { name: "우주정거장", icon: "🛰️" }, { name: "해변", icon: "🏖️" },
    { name: "카지노", icon: "🎰" }, { name: "여객선", icon: "🚢" },
    { name: "대형마트", icon: "🛒" }, { name: "병원", icon: "🏥" },
    { name: "영화관", icon: "🎬" }, { name: "호텔", icon: "🏨" },
    { name: "군대 부대", icon: "🎖️" }, { name: "학교", icon: "🏫" },
    { name: "경찰서", icon: "🚨" }, { name: "놀이공원", icon: "🎡" },
    { name: "미술관", icon: "🖼️" }, { name: "공항", icon: "✈️" },
    { name: "소방서", icon: "🚒" }, { name: "은행", icon: "💰" },
    { name: "도서관", icon: "📚" }, { name: "식당", icon: "🍽️" },
    { name: "체육관", icon: "🏀" }, { name: "동물원", icon: "🦁" },
    { name: "PC방", icon: "💻" }, { name: "노래방", icon: "🎤" },
    { name: "편의점", icon: "🏪" }, { name: "골프장", icon: "⛳" },
    { name: "스키장", icon: "⛷️" }, { name: "캠핑장", icon: "⛺" },
    { name: "방송국", icon: "📺" }, { name: "법정", icon: "⚖️" },
    { name: "연구소", icon: "🔬" }, { name: "수영장", icon: "🏊‍♂️" },
    { name: "열기구 축제", icon: "🎈" }, { name: "오아시스 마을", icon: "🏜️" },
    { name: "장난감 공장", icon: "🧸" }, { name: "워터파크 파도풀", icon: "🌊" },
    { name: "야외 스케이트장", icon: "⛸️" }, { name: "중세 마차 정거장", icon: "🐴" },
    { name: "아마존 탐험선", icon: "🐊" }, { name: "산꼭대기 천문대", icon: "🔭" },
    { name: "비밀 마법 학교", icon: "🧙‍♂️" }, { name: "조선시대 궁궐", icon: "🏯" }
];

const COLORS = ['text-rose-400', 'text-amber-400', 'text-emerald-400', 'text-cyan-400', 'text-violet-400', 'text-pink-400', 'text-blue-400', 'text-orange-400'];
const EMOJIS = ['🦊', '라이언', '🐼', '🐰', '🦁', '🐯', '🐨', '🦄', '🐸', '🐵'];

const rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, name }) => {
        socket.roomId = roomId;
        socket.playerName = name;
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                status: 'waiting',
                location: null,
                spySocketId: null
            };
        }

        const room = rooms[roomId];
        const assignedColor = COLORS[room.players.length % COLORS.length];
        const assignedEmoji = EMOJIS[room.players.length % EMOJIS.length];

        room.players.push({ 
            id: socket.id, 
            name: name, 
            color: assignedColor, 
            emoji: assignedEmoji 
        });
        
        updateRoom(roomId);
        io.to(roomId).emit('systemMessage', `${name}님이 입장했습니다.`);
    });

    socket.on('startGame', () => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room) return;

        if (room.players.length < 3) {
            socket.emit('errorMsg', '최소 3명 이상의 플레이어가 필요합니다!');
            return;
        }

        const randomLoc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
        const spyIdx = Math.floor(Math.random() * room.players.length);
        
        room.location = randomLoc;
        room.spySocketId = room.players[spyIdx].id;
        room.status = 'playing';

        room.players.forEach(p => {
            const isSpy = (p.id === room.spySocketId);
            io.to(p.id).emit('gameStarted', {
                isSpy: isSpy,
                location: isSpy ? null : randomLoc,
                players: room.players,
                locationsList: LOCATIONS
            });
        });
    });

    socket.on('sendMessage', (text) => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room) return;

        const senderObj = room.players.find(p => p.id === socket.id);
        if (!senderObj) return;

        io.to(roomId).emit('chatMessage', {
            sender: senderObj.name,
            color: senderObj.color,
            emoji: senderObj.emoji,
            text: text
        });
    });

    socket.on('triggerVote', () => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room) return;

        const spyPlayer = room.players.find(p => p.id === room.spySocketId);
        io.to(roomId).emit('gameEnded', {
            location: room.location,
            spyName: spyPlayer ? spyPlayer.name : "알 수 없음"
        });
        room.status = 'waiting';
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                updateRoom(roomId);
                io.to(roomId).emit('systemMessage', `${socket.playerName}님이 나갔습니다.`);
            }
        }
    });
});

function updateRoom(roomId) {
    const room = rooms[roomId];
    if (room) {
        io.to(roomId).emit('roomData', {
            players: room.players
        });
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
