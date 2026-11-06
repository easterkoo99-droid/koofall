const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

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
    socket.on('spy_create_room', (data) => {
        const roomId = generateRoomCode();
        rooms[roomId] = {
            roomId,
            status: 'waiting',
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

    socket.on('spy_toggle_ready', (token) => {
        const room = rooms[socket.roomId];
        if (!room) return;
        const player = Object.values(room.players).find(p => p.token === token);
        if (player && player.token !== room.hostToken) {
            player.isReady = !player.isReady;
            broadcastState(room);
        }
    });

    socket.on('spy_start_game', (token) => {
        const room = rooms[socket.roomId];
        if (!room || room.hostToken !== token || room.status !== 'waiting') return;

        const players = Object.values(room.players);
        if (players.length < 3) {
            socket.emit('spy_error', '최소 3명 이상이어야 게임을 시작할 수 있습니다.');
            return;
        }

        const loc = LOCATIONS_DATA[Math.floor(Math.random() * LOCATIONS_DATA.length)];
        room.currentLocation = loc.name;

        const shuffledRoles = [...loc.roles].sort(() => Math.random() - 0.5);
        const spyIndex = Math.floor(Math.random() * players.length);

        players.forEach((p, idx) => {
            p.isSpy = (idx === spyIndex);
            p.role = p.isSpy ? '스파이' : shuffledRoles[idx % shuffledRoles.length];
        });

        room.status = 'playing';
        room.turnIndex = 0;
        broadcastState(room);
        startTimer(room, 480);
    });

    socket.on('spy_pass_turn', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.status !== 'playing') return;

        const players = Object.values(room.players);
        const currentPlayer = players[room.turnIndex];

        if (currentPlayer.token !== data.token) return;

        const targetPlayer = players.find(p => p.token === data.targetToken);
        if (!targetPlayer) return;

        room.turnIndex = players.findIndex(p => p.token === targetPlayer.token);
        broadcastState(room);
    });

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

    socket.on('spy_vote', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.status !== 'voting') return;

        const player = Object.values(room.players).find(p => p.token === data.token);
        if (!player) return;

        room.votes[player.token] = data.agree;
        broadcastState(room);

        const players = Object.values(room.players);
        const votingPlayers = players.filter(p => p.token !== room.accusedToken);
        if (Object.keys(room.votes).length >= votingPlayers.length) {
            resolveVoting(room);
        }
    });

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
            : `❌ 스파이(${player.name})가 장소 추리에 실패하여 시민 승리!`;  broadcastState(room); });  socket.on('spy_leave_room', (token) => { leaveRoomHandler(socket, token); }); });  function joinRoomHandler(socket, roomId, name, token) { const room = rooms[roomId]; let player = Object.values(room.players).find(p => p.token === token);  if (!player) { if (Object.keys(room.players).length >= 8) { socket.emit('spy_error', '방이 가득 찼습니다 (최대 8인).'); return; } const pCount = Object.keys(room.players).length; player = { socketId: socket.id, token, name: name \vert{}\vert{} `요원${pCount + 1}`,
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
            room.endReason = `⏰ 시간이 종료되어 스파이 승리! (정답 장소: ${room.currentLocation})`; broadcastState(room); } }, 1000); }  function resolveVoting(room) { if (room.timer) clearInterval(room.timer); const votes = Object.values(room.votes); const agreeCount = votes.filter(v => v === true).length; const totalVotes = votes.length;  const accused = Object.values(room.players).find(p => p.token === room.accusedToken);  room.status = 'ended'; if (agreeCount > totalVotes / 2) { if (accused && accused.isSpy) { room.endReason = `🎉 과반수 찬성으로 스파이(${accused.name})를 색출하여 시민 승리!`;
        } else {
            room.endReason = `💥 무고한 시민(${accused ? accused.name : ''})을 지목하여 스파이 승리!`; } } else { room.endReason = `🛡️ 투표 부결로 게임이 계속 진행되어 스파이 승리!`; } broadcastState(room); }  server.listen(process.env.PORT \vert{}\vert{} 3001, () => { console.log('Spyfall Server running on port 3001'); }); ```  ---  ### 📦 수정된 `index.html` (클라이언트 코드) ```html <!DOCTYPE html> <html lang="ko"> <head> <meta charset="UTF-8"> <meta name="viewport" content="width=device-width, initial-scale=1.0"> <title>스파이폴 - 추리 게임</title> <script src="https://cdn.tailwindcss.com"></script> <script src="/socket.io/socket.io.js"></script> </head> <body class="bg-slate-950 text-slate-100 min-h-screen flex flex-col items-center justify-center p-4 font-sans">  <!-- 로비 화면 --> <div id="spy-login-screen" class="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl"> <h1 class="text-3xl font-black text-indigo-400">🕵️ 스파이폴</h1> <p class="text-xs text-slate-400">비밀 장소에서 스파이를 찾아내세요!</p> <input type="text" id="spy-name-input" placeholder="요원 닉네임 입력" maxlength="10" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-white font-bold focus:outline-none focus:border-indigo-500"> <input type="text" id="spy-room-input" placeholder="방 코드 (참가 시 입력)" maxlength="6" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-indigo-300 font-mono font-bold uppercase focus:outline-none focus:border-indigo-500"> <div class="flex gap-2 pt-2"> <button onclick="createSpyRoom()" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl transition shadow-lg">방 만들기</button> <button onclick="joinSpyRoom()" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl transition shadow-lg">방 참가</button> </div> </div>  <!-- 게임 플레이 화면 --> <div id="spy-game-screen" class="w-full max-w-3xl flex-1 flex flex-col gap-3 my-2 hidden"> <!-- 상단 헤더 --> <header class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-lg"> <div class="flex justify-between items-center"> <div class="flex items-center gap-2"> <h1 class="font-black text-indigo-400 text-lg">🕵️ 스파이폴</h1> <span id="spy-room-badge" class="bg-slate-950 text-indigo-300 text-xs px-2.5 py-1 rounded-md font-mono font-bold"></span> <button onclick="copySpyInviteLink()" class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-2.5 py-1 rounded-md font-bold transition">초대링크 복사</button> <button onclick="leaveSpyRoom()" class="bg-rose-600 hover:bg-rose-500 text-white text-xs px-2.5 py-1 rounded-md font-bold transition">방 나가기</button> </div> <div id="game-timer" class="text-rose-400 font-mono font-bold text-sm hidden">⏱️ 08:00</div> </div> <!-- 플레이어 목록 바 --> <div id="spy-players-bar" class="flex gap-2 overflow-x-auto border-t border-slate-800 pt-3"></div> </header>  <!-- 내 정보 및 역할 카드 패널 --> <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-lg relative flex flex-col items-center justify-center min-h-[180px]"> <div id="waiting-host-panel" class="space-y-4 w-full"> <h2 class="text-sm font-bold text-indigo-300">최소 3명 이상 필요하며, 준비 완료 시 방장이 시작할 수 있습니다.</h2> <div id="spy-action-btn-area"></div> </div>  <div id="role-card-panel" class="hidden space-y-3 w-full"> <div class="inline-block bg-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full font-bold">비밀 정보 카드</div> <div id="card-content" class="text-2xl font-black text-white"></div> <div id="turn-notice" class="text-sm font-bold text-amber-400 mt-2"></div> </div> </div>  <!-- 하단: 턴 지목 컨트롤 & 투표 패널 --> <div id="control-panel" class="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg hidden"> <div id="question-control" class="space-y-3"> <div class="text-xs font-bold text-slate-400">상대방에게 질문하고 다음 순서로 지목하세요 (A ➡️ B)</div> <div class="flex gap-2"> <select id="target-select" class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none"></select> <button onclick="passTurn()" class="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl text-sm font-black transition">질문 넘기기</button> </div> </div>  <div id="spy-actions" class="flex gap-2 mt-3 pt-3 border-t border-slate-800"> <button onclick="openAccuseModal()" class="flex-1 bg-rose-600 hover:bg-rose-500 py-2.5 rounded-xl text-xs font-bold transition">🚨 스파이 지목하기</button> <button onclick="openGuessModal()" id="spy-guess-btn" class="flex-1 bg-amber-600 hover:bg-amber-500 py-2.5 rounded-xl text-xs font-bold transition hidden">🕵️‍♂️ 장소 맞추기 선언</button> </div> </div> </div>  <!-- 투표 모달 --> <div id="vote-modal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"> <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl"> <h2 class="text-xl font-black text-rose-400">🚨 스파이 투표 진행 중</h2> <p id="vote-target-text" class="text-sm text-slate-300 font-bold"></p> <div class="flex gap-2 pt-2"> <button onclick="castVote(true)" class="flex-1 bg-emerald-600 hover:bg-emerald-500 py-3 rounded-xl font-black text-white transition">찬성 👍</button> <button onclick="castVote(false)" class="flex-1 bg-rose-600 hover:bg-rose-500 py-3 rounded-xl font-black text-white transition">반대 👎</button> </div> </div> </div>  <!-- 게임 종료 모달 --> <div id="spy-game-over-modal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"> <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl"> <h2 class="text-2xl font-black text-indigo-400">🏁 게임 종료</h2> <p id="end-reason-text" class="text-base font-bold text-amber-300 bg-slate-950 p-4 rounded-xl"></p> <button onclick="location.reload()" class="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-bold text-white transition">로비로 돌아가기</button> </div> </div>  <script> // 소켓 연결 주소를 자동 호스트 연동 방식으로 수정 const socket = io();  function getSpyToken() { let token = localStorage.getItem('spy_token'); if (!token) { token = 's_tok_' + Math.random().toString(36).substring(2, 10); localStorage.setItem('spy_token', token); } return token; }  window.addEventListener('DOMContentLoaded', () => { const params = new URLSearchParams(location.search); const rParam = params.get('spy_room'); if (rParam) document.getElementById('spy-room-input').value = rParam; });  function createSpyRoom() { const name = document.getElementById('spy-name-input').value.trim(); if (!name) { alert('닉네임을 입력하세요.'); return; } localStorage.setItem('spy_name', name); socket.emit('spy_create_room', { name, token: getSpyToken() }); }  function joinSpyRoom() { const name = document.getElementById('spy-name-input').value.trim(); const roomId = document.getElementById('spy-room-input').value.trim(); if (!name \vert{}\vert{} !roomId) { alert('닉네임과 방 코드를 입력하세요.'); return; } localStorage.setItem('spy_name', name); localStorage.setItem('spy_room', roomId); socket.emit('spy_join_room', { name, roomId, token: getSpyToken() }); }  function leaveSpyRoom() { if (confirm('방을 나가시겠습니까?')) socket.emit('spy_leave_room', getSpyToken()); }  function copySpyInviteLink() { const roomId = document.getElementById('spy-room-badge').innerText; navigator.clipboard.writeText(`${location.origin}${location.pathname}?spy_room=${roomId}`);
            alert('초대 링크가 복사되었습니다!');
        }

        socket.on('spy_joined_success', (data) => {
            localStorage.setItem('spy_room', data.roomId);
            document.getElementById('spy-login-screen').classList.add('hidden');
            document.getElementById('spy-game-screen').classList.remove('hidden');
            document.getElementById('spy-room-badge').innerText = data.roomId;
        });

        socket.on('spy_left_success', () => {
            localStorage.removeItem('spy_room');
            location.href = location.pathname;
        });

        socket.on('spy_state_update', (room) => {
            const myToken = getSpyToken();
            const isHost = (room.hostToken === myToken);
            const me = Object.values(room.players).find(p => p.token === myToken);
            const players = Object.values(room.players);

            document.getElementById('spy-players-bar').innerHTML = players.map(p => `
                <div class="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs flex gap-2
