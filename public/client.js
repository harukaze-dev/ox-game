// 08 ox game\ox game_250628_02\public\client.js
// public/client.js

// --- 전역 변수 및 DOM 요소 캐싱 ---
let gameConfig = null, currentUserData = {}, currentRoomId = null, currentGameState = {};
let userIntent = null, roomToJoin = null, timerAnimationId = null, playerToKick = null;
const socket = io();

const mainMenu = document.getElementById('main-menu'), createRoomBtn = document.getElementById('create-room-btn'), roomCodeInput = document.getElementById('room-code-input'), joinRoomBtn = document.getElementById('join-room-btn');
const profileSetup = document.getElementById('profile-setup'), confirmProfileBtn = document.getElementById('confirm-profile-btn'), profileSetupTitle = document.getElementById('profile-setup-title'), profileSetupDescription = document.getElementById('profile-setup-description'), roleRadios = document.querySelectorAll('input[name="role"]'), streamerOptions = document.getElementById('streamer-options'), streamerSelect = document.getElementById('streamer-select'), streamerKeyInput = document.getElementById('streamer-key-input'), nicknameInput = document.getElementById('nickname-input'), nicknameGroup = document.getElementById('nickname-group'), fanGroupDisplay = document.getElementById('fan-group-display'), fanMultiStreamerOptions = document.getElementById('fan-multi-streamer-options'), fanGroupSelect = document.getElementById('fan-group-select'), backToLobbyBtn = document.getElementById('back-to-lobby-btn');
const gameContainer = document.getElementById('game-container'), questionContent = document.getElementById('question-content'), choicesContainer = document.getElementById('choices-container'), playerArea = document.getElementById('player-area'), eliminatedArea = document.getElementById('eliminated-area'), activePlayerCountSpan = document.getElementById('active-player-count'), eliminatedPlayerCountSpan = document.getElementById('eliminated-player-count'), progressBarContainer = document.getElementById('progress-bar-container'), progressBar = document.getElementById('progress-bar');
const activeFandomCounts = document.getElementById('active-fandom-counts'), eliminatedFandomCounts = document.getElementById('eliminated-fandom-counts');
const hostControls = document.getElementById('host-controls'), startGameBtn = document.getElementById('start-game-btn'), newQuestionBtn = document.getElementById('new-question-btn'), endRoundBtn = document.getElementById('end-round-btn'), revivalBtn = document.getElementById('revival-btn'), resetGameBtn = document.getElementById('reset-game-btn'), leaveRoomBtn = document.getElementById('leave-room-btn');
const createQuestionModal = document.getElementById('create-question-modal'), questionForm = document.getElementById('question-form'), questionText = document.getElementById('question-text'), questionTimerInput = document.getElementById('question-timer-input'), choicesInputArea = document.getElementById('choices-input-area'), modalTitle = document.getElementById('modal-title'), cancelQuestionBtn = document.getElementById('cancel-question-btn');
const selectQuestionerModal = document.getElementById('select-questioner-modal'), selectQuestionerTitle = document.getElementById('select-questioner-title'), questionerList = document.getElementById('questioner-list'), cancelSelectQuestionerBtn = document.getElementById('cancel-select-questioner-btn');
const kickConfirmModal = document.getElementById('kick-confirm-modal'), kickPlayerName = document.getElementById('kick-player-name'), confirmKickBtn = document.getElementById('confirm-kick-btn'), cancelKickBtn = document.getElementById('cancel-kick-btn');
const gameOverModal = document.getElementById('game-over-modal'), winnerInfo = document.getElementById('winner-info'), gameOverCloseBtn = document.getElementById('game-over-close-btn');
const toastPopup = document.getElementById('toast-popup');
const emotionPopup = document.getElementById('emotion-popup');
const emotionOptions = document.getElementById('emotion-options');


function showToast(message) { 
    toastPopup.textContent = message; 
    toastPopup.classList.remove('hidden'); 
    setTimeout(() => toastPopup.classList.add('hidden'), 2500); 
}


function updateProfileSetupUI() {
    const role = document.querySelector('input[name="role"]:checked').value;

    streamerOptions.classList.toggle('hidden', role !== 'streamer');
    nicknameGroup.classList.toggle('hidden', role === 'streamer');
    fanMultiStreamerOptions.classList.add('hidden'); 
    fanGroupDisplay.classList.add('hidden');

    if (role === 'streamer') { 
        const s = gameConfig.streamers.find(s => s.id === streamerSelect.value); 
        if (s) nicknameInput.value = s.name; 
    } else { 
        nicknameInput.value = ''; 
    }
}


function updateChoiceInputs() {
    const isOX = document.querySelector('#type-ox').checked;
    const count = parseInt(document.querySelector('input[name="question-type"]:checked').value, 10);
    
    choicesInputArea.innerHTML = '';

    for (let i = 0; i < count; i++) {
        const group = document.createElement('div');
        const label = isOX ? (i === 0 ? 'O' : 'X') : `${i + 1}`;
        const placeholder = isOX ? label : `선택지 내용`;
        const value = isOX ? label : '';

        group.className = 'choice-input-group';
        group.innerHTML = `<input type="radio" name="correctAnswer" value="${i}" id="c-${i}" required oninvalid="this.setCustomValidity('정답 선택 필수')" oninput="this.setCustomValidity('')"><label for="c-${i}">${label}</label><input type="text" value="${value}" placeholder="${placeholder}" required>`;
        choicesInputArea.appendChild(group);
    }
}


function renderFandomCounts(players, containerElement) {
    if (!gameConfig) return;
    
    const counts = {};
    players.forEach(p => {
        if (p.fanGroup) {
            counts[p.fanGroup] = (counts[p.fanGroup] || 0) + 1;
        }
    });

    containerElement.innerHTML = ''; 

    for (const fanGroupId in counts) {
        const streamer = gameConfig.streamers.find(s => s.fandom.id === fanGroupId);
        if (streamer) {
            const item = document.createElement('div');
            item.className = 'fandom-count-item';
            item.innerHTML = `<img src="${streamer.fandom.pfp}" alt="${streamer.fandom.name}"> ${counts[fanGroupId]}`;
            containerElement.appendChild(item);
        }
    }
}


function renderGame(state) {
    currentGameState = state;
    const isOwner = currentUserData.id === state.ownerId;
    const isStreamer = currentUserData.role === 'streamer';
    const players = Object.values(state.players);
    const activeFans = players.filter(p => p.role === 'fan' && p.status === 'active');
    const eliminatedFans = players.filter(p => p.role === 'fan' && p.status === 'eliminated');
    
    activePlayerCountSpan.textContent = `(${activeFans.length})`;
    eliminatedPlayerCountSpan.textContent = `(${eliminatedFans.length})`;
    
    renderFandomCounts(activeFans, activeFandomCounts);
    renderFandomCounts(eliminatedFans, eliminatedFandomCounts);
    
    hostControls.classList.toggle('hidden', !isStreamer);
    if (isStreamer) {
        startGameBtn.classList.toggle('hidden', state.gameState !== 'lobby' || !isOwner);
        const canControl = state.gameState !== 'question' && state.gameState !== 'lobby';
        newQuestionBtn.classList.toggle('hidden', !canControl || state.gameState === 'finished');
        revivalBtn.classList.toggle('hidden', !canControl || state.gameState === 'finished' || eliminatedFans.length === 0);
        endRoundBtn.classList.toggle('hidden', state.gameState !== 'question');
        resetGameBtn.classList.toggle('hidden', state.gameState !== 'finished');
    }
    
    renderPlayers(state.players, isStreamer);

    if (state.gameState === 'lobby') {
        renderLobby(isStreamer);
    } else if (state.gameState === 'question') {
        renderQuestion(state.currentQuestion, isStreamer);
    } else if (state.gameState === 'finished') {
        renderGameOver(players.find(p => p.role === 'fan' && p.status === 'active'));
    }
}


function renderLobby(isStreamer) {
    if (timerAnimationId) cancelAnimationFrame(timerAnimationId);
    progressBarContainer.classList.add('hidden');
    
    const codeButtonHTML = isStreamer ? `<div id="room-code-area"><button id="copy-code-btn">📋  초대 코드 복사</button></div>` : '';
    const messageHTML = `<div class="lobby-message"><h2>게임 대기 중...</h2><p>모든 플레이어가 들어올 때까지 기다려주세요.</p>${codeButtonHTML}</div>`;
    
    questionContent.innerHTML = messageHTML;
    choicesContainer.innerHTML = '';
    
    if (isStreamer) {
        const copyBtn = document.getElementById('copy-code-btn');
        if (copyBtn) {
            copyBtn.onclick = () => {
                if (currentRoomId) navigator.clipboard.writeText(currentRoomId).then(() => showToast('코드 복사 완료!'));
            };
        }
    }
}


function renderQuestion(question, isStreamer) {
    if (!question) return;

    questionContent.textContent = question.text;
    choicesContainer.innerHTML = '';
    choicesContainer.dataset.count = question.choices.length;
    
    if (timerAnimationId) cancelAnimationFrame(timerAnimationId);

    progressBarContainer.classList.remove('hidden');
    progressBar.style.width = '100%';

    const endTime = question.startTime + question.duration * 1000;

    function animateTimer() {
        const now = Date.now();
        const remainingTime = endTime - now;

        if (remainingTime <= 0) {
            progressBar.style.width = '0%';
            return;
        }

        const percentage = (remainingTime / (question.duration * 1000)) * 100;
        progressBar.style.width = `${percentage}%`;
        
        timerAnimationId = requestAnimationFrame(animateTimer);
    }

    animateTimer();
    
    const myPlayer = currentGameState.players[currentUserData.id];
    const isOX = question.choices.length === 2 && question.choices[0] === 'O' && question.choices[1] === 'X';

    question.choices.forEach((text, i) => {
        const box = document.createElement('div');
        box.className = 'choice-box';
        box.dataset.index = i;
        const label = isOX ? (i === 0 ? 'O' : 'X') : (i + 1);
        const contentText = isOX ? '' : text; 
        
        box.innerHTML = `
            <div class="choice-text">
                <span class="choice-label">${label}</span>
                <span class="choice-content-text">${contentText}</span>
            </div>`;

        const isMyTurn = myPlayer && ((!currentGameState.isRevival && myPlayer.status === 'active') || (currentGameState.isRevival && myPlayer.status === 'eliminated'));
        if (isMyTurn && !isStreamer) {
            box.onclick = () => socket.emit('submit answer', i); 
        } else {
            box.classList.add('disabled');
        }
        choicesContainer.appendChild(box);
    });

    renderPlayers(currentGameState.players, isStreamer);
}


function renderPlayers(players, isStreamer) {
    playerArea.innerHTML = '';
    eliminatedArea.innerHTML = '';
    document.querySelectorAll('.choice-box .player-token').forEach(t => t.remove());

    Object.values(players).forEach(p => {
        if (p.role === 'streamer') return;

        const token = document.createElement('div');
        token.className = 'player-token';
        token.id = `player-${p.id}`;
        
        const nicknameStyle = `style="background-color: ${p.color || '#4a5568'}; color: ${p.textColor || 'white'};"`;
        token.innerHTML = `<img src="${p.pfp}" alt="${p.nickname}"><span class="nickname" ${nicknameStyle}>${p.nickname}</span>`;
        
        token.querySelector('img').style.animationDelay = `${Math.random() * -4}s`;

        if (p.id === currentUserData.id) {
            token.classList.add('my-token');
            token.addEventListener('click', (e) => {
                e.stopPropagation();
                showEmotionPopup(token);
            });
        }
        
        if (isStreamer) {
            token.classList.add('is-streamer-view');
            if (p.id !== currentUserData.id) {
                token.addEventListener('click', () => { 
                    playerToKick = p; 
                    kickPlayerName.textContent = p.nickname; 
                    kickConfirmModal.classList.remove('hidden'); 
                });
            }
        }
        
        let destination = null;

        if (p.answer !== null && choicesContainer.children[p.answer]) {
            destination = choicesContainer.children[p.answer];
        } else if (p.status === 'active') {
            destination = playerArea;
        } else {
            destination = eliminatedArea;
        }
        
        if (p.status === 'eliminated') {
            token.classList.add('eliminated-token');
        }

        if (destination) {
            destination.appendChild(token);
        }
    });
}


function handleRoundResult(result) {
    if (timerAnimationId) cancelAnimationFrame(timerAnimationId);

    currentGameState = result;

    Array.from(choicesContainer.children).forEach((box, i) => { 
        box.onclick = null; 
        box.classList.remove('disabled'); 
        if (i == result.correctAnswer) {
            box.classList.add('correct'); 
        } else {
            box.classList.add('incorrect'); 
        }
    });

    document.querySelectorAll('.player-token').forEach(t => { 
        const p = result.players[t.id.split('-')[1]]; 
        if (p) { 
            if(p.answer == result.correctAnswer) {
                t.classList.add('correct-answer');
            } else if(p.answer !== null) {
                t.classList.add('incorrect-answer');
            }
        }
    });

    renderGame(currentGameState);

    setTimeout(() => {
        progressBarContainer.classList.add('hidden');
        Array.from(choicesContainer.children).forEach(box => box.classList.remove('correct', 'incorrect'));
        document.querySelectorAll('.player-token').forEach(t => t.classList.remove('correct-answer', 'incorrect-answer'));
        renderPlayers(result.players, currentUserData.role === 'streamer');
    }, 3000);
}


function renderGameOver(winner) {
    winnerInfo.innerHTML = winner ? `<img src="${winner.pfp}" alt="${winner.nickname}"><h2>${winner.nickname}</h2>` : `<h2>우승자가 없습니다!</h2>`;
    gameOverModal.classList.remove('hidden');
}


function openQuestionerSelectModal(isForRevival) {
    selectQuestionerTitle.textContent = isForRevival ? "패자부활전 문제 출제자 선택" : "문제 출제자 선택";
    questionerList.innerHTML = '';

    Object.values(currentGameState.players).filter(p => p.role === 'streamer').forEach(streamer => {
        const item = document.createElement('div');
        item.className = 'questioner-item';
        item.innerHTML = `<img src="${streamer.pfp}" alt="${streamer.nickname}"><span>${streamer.nickname}</span>`;
        item.onclick = () => { 
            socket.emit('designate questioner', { questionerId: streamer.id, isRevival: isForRevival }); 
            selectQuestionerModal.classList.add('hidden'); 
        };
        questionerList.appendChild(item);
    });

    selectQuestionerModal.classList.remove('hidden');
}


function showEmotionPopup(targetToken) {
    const rect = targetToken.getBoundingClientRect();
    
    emotionOptions.style.top = `${rect.top - emotionOptions.offsetHeight - 10}px`;
    emotionOptions.style.left = `${rect.left + (rect.width / 2) - (emotionOptions.offsetWidth / 2)}px`;
    
    emotionPopup.classList.remove('hidden');
}


// --- 이벤트 리스너 ---
function initialize() { 
    if (!gameConfig) return; 

    streamerSelect.innerHTML = ''; 
    gameConfig.streamers.forEach(s => { 
        const o = document.createElement('option'); 
        o.value = s.id; 
        o.textContent = s.name; 
        streamerSelect.appendChild(o); 
    }); 

    updateProfileSetupUI(); 
    updateChoiceInputs(); 

    document.querySelectorAll('input[name="question-type"]').forEach(radio => {
        radio.addEventListener('change', updateChoiceInputs);
    });

    emotionPopup.addEventListener('click', (e) => {
        if (e.target === emotionPopup) {
            emotionPopup.classList.add('hidden');
        }
    });

    emotionOptions.addEventListener('click', (e) => {
        if (e.target.dataset.emoji) {
            const emoji = e.target.dataset.emoji;
            socket.emit('express emotion', emoji);
            emotionPopup.classList.add('hidden');
        }
    });

    roomCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            joinRoomBtn.click();
        }
    });

    nicknameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmProfileBtn.click();
        }
    });

    streamerKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmProfileBtn.click();
        }
    });
}

createRoomBtn.addEventListener('click', () => { 
    userIntent = 'create'; 
    mainMenu.classList.add('hidden'); 
    profileSetup.classList.remove('hidden'); 
    profileSetupTitle.textContent = '방 만들기 (스트리머)'; 
    profileSetupDescription.textContent = '스트리머로 방을 생성합니다.'; 
    document.getElementById('role-streamer').checked = true; 
    updateProfileSetupUI(); 
});

joinRoomBtn.addEventListener('click', () => { 
    const code = roomCodeInput.value.trim().toUpperCase(); 
    if (!code) return showToast('초대 코드를 입력해주세요.'); 
    userIntent = 'join'; 
    roomToJoin = code; 
    socket.emit('get room info', code); 
});

backToLobbyBtn.addEventListener('click', () => { 
    profileSetup.classList.add('hidden'); 
    mainMenu.classList.remove('hidden'); 
});

roleRadios.forEach(r => r.addEventListener('change', updateProfileSetupUI));

streamerSelect.addEventListener('change', updateProfileSetupUI);

confirmProfileBtn.addEventListener('click', () => {
    const role = document.querySelector('input[name="role"]:checked').value;
    const nickname = nicknameInput.value.trim();
    
    if (role === 'fan' && !nickname) return showToast('닉네임을 입력해주세요!');
    
    const userData = { nickname, role };
    
    if (role === 'streamer') { 
        const s = gameConfig.streamers.find(s => s.id === streamerSelect.value); 
        userData.nickname = s.name; 
        userData.pfp = s.pfp; 
        userData.streamerId = s.id; 
        userData.streamerKey = streamerKeyInput.value.trim(); 
    } else { 
        const fanGroup = fanGroupSelect.value; 
        if (fanMultiStreamerOptions.classList.contains('hidden')) { 
            userData.fanGroup = fanGroupDisplay.dataset.fandomId; 
        } else { 
            if (!fanGroup) return showToast('응원할 스트리머를 선택해주세요.'); 
            userData.fanGroup = fanGroup; 
        } 
    }
    
    if (userIntent === 'create') {
        socket.emit('create room', userData); 
    } else if (userIntent === 'join') {
        socket.emit('join room', { roomId: roomToJoin, userData });
    }
});

startGameBtn.onclick = () => openQuestionerSelectModal(false);
newQuestionBtn.onclick = () => openQuestionerSelectModal(false);
revivalBtn.onclick = () => openQuestionerSelectModal(true);
endRoundBtn.onclick = () => { 
    if (timerAnimationId) cancelAnimationFrame(timerAnimationId); 
    socket.emit('end round'); 
};
resetGameBtn.onclick = () => { if(confirm('게임을 초기화하시겠습니까?')) socket.emit('reset game'); };
leaveRoomBtn.onclick = () => { if(confirm('방을 나가시겠습니까?')) window.location.reload(); };
cancelSelectQuestionerBtn.onclick = () => selectQuestionerModal.classList.add('hidden');

questionForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = questionText.value.trim();
    const choices = Array.from(choicesInputArea.querySelectorAll('input[type="text"]')).map(i => i.value.trim());
    const radio = choicesInputArea.querySelector('input[name="correctAnswer"]:checked');
    const duration = parseInt(questionTimerInput.value, 10) || 20;

    if (!text || choices.some(c => !c) || !radio) return;
    
    const questionData = { text, choices, correctAnswer: radio.value, duration };
    socket.emit('new question', questionData);
    createQuestionModal.classList.add('hidden');
});

cancelQuestionBtn.onclick = () => createQuestionModal.classList.add('hidden');
confirmKickBtn.onclick = () => { 
    if (playerToKick) socket.emit('kick player', playerToKick.id); 
    kickConfirmModal.classList.add('hidden'); 
};
cancelKickBtn.onclick = () => kickConfirmModal.classList.add('hidden');
gameOverCloseBtn.onclick = () => { 
    gameOverModal.classList.add('hidden'); 
    if(currentUserData.role === 'streamer') showToast('게임을 다시 시작하려면 "게임 초기화" 또는 "문제 출제" 버튼을 누르세요.'); 
};

// --- 소켓 핸들러 ---
socket.on('connect', () => console.log('서버 연결됨'));
socket.on('server config', (config) => { 
    gameConfig = config; 
    initialize(); 
});

socket.on('room info response', ({ streamersInRoom }) => {
    mainMenu.classList.add('hidden'); 
    profileSetup.classList.remove('hidden'); 
    profileSetupTitle.textContent = '방 참여하기';
    
    document.getElementById('role-fan').checked = true; 
    updateProfileSetupUI();

    if (streamersInRoom.length === 1) {
        const s = streamersInRoom[0];
        const fandom = gameConfig.streamers.find(c => c.id === s.streamerId).fandom;
        fanGroupDisplay.classList.remove('hidden'); 
        fanGroupDisplay.textContent = `${fandom.name} 팬덤으로 자동 참여됩니다.`;
        fanGroupDisplay.dataset.fandomId = fandom.id; 
        fanMultiStreamerOptions.classList.add('hidden');
    } else {
        fanGroupDisplay.classList.add('hidden'); 
        fanMultiStreamerOptions.classList.remove('hidden');
        fanGroupSelect.innerHTML = '<option value="">-- 선택 --</option>';
        streamersInRoom.forEach(s => {
            const fandom = gameConfig.streamers.find(c => c.id === s.streamerId).fandom;
            const opt = document.createElement('option'); 
            opt.value = fandom.id; 
            opt.textContent = fandom.name;
            fanGroupSelect.appendChild(opt);
        });
    }
});

socket.on('your turn to question', ({ isRevival }) => {
    modalTitle.textContent = isRevival ? "패자부활전 문제 출제" : "문제 출제";
    questionForm.reset(); 
    updateChoiceInputs();
    createQuestionModal.classList.remove('hidden');
});

socket.on('game message', (text) => { 
    showToast(text); 
});

socket.on('game state update', (state) => {
    if (!currentUserData.id) {
        currentUserData = state.players[socket.id] || {};
    }
    currentRoomId = state.roomId;
    
    profileSetup.classList.add('hidden'); 
    mainMenu.classList.add('hidden'); 
    gameContainer.classList.remove('hidden');
    
    renderGame(state);
});

socket.on('player moved', ({ playerId, answerIndex }) => { 
    const t = document.getElementById(`player-${playerId}`);
    const c = choicesContainer.children[answerIndex]; 
    if (t && c) {
        c.appendChild(t); 
    }
});

socket.on('round result', handleRoundResult);

socket.on('error message', (message) => { 
    alert(message); 
    window.location.reload(); 
});

socket.on('emotion expressed', ({ playerId, emoji }) => {
    const playerToken = document.getElementById(`player-${playerId}`);
    if (!playerToken) return;

    // 말풍선이 이미 있다면 제거
    document.querySelectorAll('.emotion-bubble').forEach(b => b.remove());

    const emotionEl = document.createElement('div');
    emotionEl.className = 'emotion-bubble';
    emotionEl.textContent = emoji;
    
    // [수정] 토큰의 화면상 절대 좌표를 계산
    const rect = playerToken.getBoundingClientRect();
    
    // [수정] 계산된 좌표를 바탕으로 말풍선의 위치를 설정
    // 말풍선의 `transform: translateX(-50%)`가 있으므로 left는 토큰의 중앙으로 맞춤
    emotionEl.style.left = `${rect.left + rect.width / 2}px`; 
    // 말풍선의 높이와 꼬리 길이 등을 고려하여 top 위치 조정
    emotionEl.style.top = `${rect.top - 45}px`; 

    // [수정] 말풍선을 playerToken이 아닌 document.body에 추가
    document.body.appendChild(emotionEl);

    // 토큰 자체의 z-index를 높이는 로직은 그대로 유지
    playerToken.classList.add('is-expressing');

    setTimeout(() => {
        // [수정] document.body에 추가된 요소를 안전하게 제거
        if (emotionEl.parentNode) {
            emotionEl.remove();
        }
        playerToken.classList.remove('is-expressing');
    }, 1500);
});