const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// 스파이폴 장소 및 역할 데이터
const LOCATIONS_DATA = [
    { name: '해수욕장 🏖️', roles: ['안전요원', '관광객', '상인', '서퍼', '사진작가', '아이스크림 장수'] },
    { name: '우주정거장 🚀', roles: ['우주비행사', '선장', '엔지니어', '과학자', '의사', '관광객'] },
    { name: '카지노 🎰', roles: ['딜러', '도박꾼', '경비원', '바텐더', '매니저', '귀빈'] },
    { name: '여객기 ✈️', roles: ['기장', '승무원', '퍼스트클래스 승객', '이코노미 승객', '항공 보안관', '정비사'] },
    { name: '해적선 🏴‍☠️', roles: ['선장', '항해사', '포격수', '요리사', '포로', '선원'] },
    { name: '영화 촬영장 🎬', roles: ['감독', '배우', '카메라맨', '조명 스태프', '분장사', '시나리오 작가'] }
];

let rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    // 방 생성
    socket.on('spy_create_room', (data) => {
        const roomId = generateRoomCode();
        rooms[roomId] = {
            roomId,
            status: 'waiting', // waiting, playing, voting, ended
            currentLocation: null,
            hostToken: data.token,
            turnIndex: 0,
            accuserToken: null,
            accusedToken: null,
            votes: {},
            timer: null,
            players: {}
        };
        joinRoomHandler(socket, roomId, data.name, data.token);
    });

    // 방 참가
    socket.on('spy_join_room', (data) => {
        const roomId = data.roomId ? data.roomId.trim().toUpperCase() : '';
        if (!rooms[roomId]) {
            socket.emit('spy_error', '존재하지 않는 방 코드입니다.');
            return;
        }
        if (rooms[roomId].status !== 'waiting') {
            socket.emit('spy_error', '이미 게임이 진행 중인 방입니다.');
            return;
        }
        joinRoomHandler(socket, roomId, data.name, data.token);
    });

    // 준비 토글
    socket.on('spy_toggle_ready', (token) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        const player = Object.values(room.players).find(p => p.token === token);
        if (player && player.token !== room.hostToken) {
            player.isReady = !player.isReady;
            broadcastState(room);
        }
    });

    // 게임 시작 (방장 전용)
    socket.on('spy_start_game', (token) => {
        const room = rooms[socket.roomId];
        if (!room || room.hostToken !== token || room.status !== 'waiting') return;

        const players = Object.values(room.players);
        if (players.length < 3) {
            socket.emit('spy_error', '최소 3명 이상이어야 게임을 시작할 수 있습니다.');
            return;
        }

        // 장소 무작위 선택
        const loc = LOCATIONS_DATA[Math.floor(Math.random() * LOCATIONS_DATA.length)];
        room.currentLocation = loc.name;

        // 역할 섞기
        const shuffledRoles = [...loc.roles].sort(() => Math.random() - 0.5);
        // 스파이 무작위 선정
        const spyIndex = Math.floor(Math.random() * players.length);

        players.forEach((p, idx) => {
            p.isSpy = (idx === spyIndex);
            p.role = p.isSpy ? '스파이' : shuffledRoles[idx % shuffledRoles.length];
        });

        room.status = 'playing';
        room.turnIndex = 0;
        broadcastState(room);
        startTimer(room, 480); // 8분 제한 시간
    });

    // 질문 차례 넘기기 (A -> B 지목)
    socket.on('spy_pass_turn', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.status !== 'playing') return;

        const players = Object.values(room.players);
        const currentPlayer = players[room.turnIndex];

        // 현재 차례인 사람만 다음 사람을 지목할 수 있음
        if (currentPlayer.token !== data.token) return;

        const targetPlayer = players.find(p => p.token === data.targetToken);
        if (!targetPlayer) return;

        room.turnIndex = players.findIndex(p => p.token === targetPlayer.token);
        broadcastState(room);
    });

    // 스파이 지목 (투표 시작)
    socket.on('spy_accuse', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.status !== 'playing') return;

        const accuser = Object.values(room.players).find(p => p.token === data.token);
        const target = Object.values(room.players).find(p => p.token === data.targetToken);
        if (!accuser || !target) return;

        room.status = 'voting';
        room.accuserToken = accuser.token;
        room.accusedToken = target.token;
        room.votes = {};
        broadcastState(room);
    });

    // 투표 참여 (찬성/반대)
    socket.on('spy_vote', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.status !== 'voting') return;

        const player = Object.values(room.players).find(p => p.token === data.token);
        if (!player) return;

        room.votes[player.token] = data.agree; // true 또는 false
        broadcastState(room);

        const players = Object.values(room.players);
        // 지목된 본인을 제외한 인원들이 모두 투표했는지 확인
        const votingPlayers = players.filter(p => p.token !== room.accusedToken);
        if (Object.keys(room.votes).length >= votingPlayers.length) {
            resolveVoting(room);
        }
    });

    // 스파이의 장소 맞추기 선언
    socket.on('spy_guess_location', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.status !== 'playing') return;

        const player = Object.values(room.players).find(p => p.token === data.token);
        if (!player || !player.isSpy) return;

        if (room.timer) clearInterval(room.timer);
        room.status = 'ended';

        const isCorrect = (data.guessedLocation === room.currentLocation);
        room.endReason = isCorrect 
            ? `🕵️ 스파이(${player.name})가 장소 [${room.currentLocation}]를 정확히 맞춰서 스파이 승리!` 
            : `❌ 스파이(${player.name})가 장소 추리에 실패하여 시민 승리!`;
        
        broadcastState(room);
    });

    // 방 나가기
    socket.on('spy_leave_room', (token) => {
        leaveRoomHandler(socket, token);
    });
});

function joinRoomHandler(socket, roomId, name, token) {
    const room = rooms[roomId];
    let player = Object.values(room.players).find(p => p.token === token);

    if (!player) {
        if (Object.keys(room.players).length >= 8) {
            socket.emit('spy_error', '방이 가득 찼습니다 (최대 8인).');
            return;
        }
        const pCount = Object.keys(room.players).length;
        player = {
            socketId: socket.id,
            token,
            name: name || `요원${pCount + 1}`,
            role: '대기 중',
            isSpy: false,
            isReady: pCount === 0
        };
        room.players[socket.id] = player;
    } else {
        delete room.players[player.socketId];
        player.socketId = socket.id;
        room.players[socket.id] = player;
    }

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('spy_joined_success', { roomId, token: player.token });
    broadcastState(room);
}

function leaveRoomHandler(socket, token) {
    const roomId = socket.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    let targetKey = null;
    for (const [sId, p] of Object.entries(room.players)) {
        if (p.token === token) { targetKey = sId; break; }
    }

    if (targetKey) delete room.players[targetKey];
    socket.leave(roomId);
    socket.roomId = null;
    socket.emit('spy_left_success');

    if (Object.keys(room.players).length === 0) {
        if (room.timer) clearInterval(room.timer);
        delete rooms[roomId];
    } else {
        if (room.hostToken === token) {
            const nextP = Object.values(room.players)[0];
            room.hostToken = nextP.token;
            nextP.isReady = true;
        }
        broadcastState(room);
    }
}

function broadcastState(room) {
    io.to(room.roomId).emit('spy_state_update', room);
}

function startTimer(room, seconds) {
    if (room.timer) clearInterval(room.timer);
    let timeLeft = seconds;

    room.timer = setInterval(() => {
        timeLeft--;
        io.to(room.roomId).emit('spy_timer_tick', timeLeft);
        if (timeLeft <= 0) {
            clearInterval(room.timer);
            room.status = 'ended';
            room.endReason = `⏰ 시간이 종료되어 스파이 승리! (정답 장소: ${room.currentLocation})`;
            broadcastState(room);
        }
    }, 1000);
}

function resolveVoting(room) {
    if (room.timer) clearInterval(room.timer);
    const votes = Object.values(room.votes);
    const agreeCount = votes.filter(v => v === true).length;
    const totalVotes = votes.length;

    const accused = Object.values(room.players).find(p => p.token === room.accusedToken);

    room.status = 'ended';
    if (agreeCount > totalVotes / 2) {
        if (accused && accused.isSpy) {
            room.endReason = `🎉 과반수 찬성으로 스파이(${accused.name})를 색출하여 시민 승리!`;
        } else {
            room.endReason = `💥 무고한 시민(${accused ? accused.name : ''})을 지목하여 스파이 승리!`;
        }
    } else {
        room.endReason = `🛡️ 투표 부결로 게임이 계속 진행되어 스파이 승리!`;
    }
    broadcastState(room);
}

server.listen(3001, () => {
    console.log('Spyfall Server running on port 3001');
});
