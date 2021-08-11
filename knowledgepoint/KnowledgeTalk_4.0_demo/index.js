//socket session 연결
const clientIo = io.connect("https://dev.knowledgetalk.co.kr:7100/SignalServer",{});


//해당태그에 접근하기 위해서 각 btn에 id 값을 넣는다. 
const roomIdInput = document.getElementById("roomIdInput");
const videoBox = document.getElementById("videoBox");
const printBox = document.getElementById("printBox")

const CreateRoomBtn = document.getElementById("CreateRoomBtn");
const RoomJoinBtn = document.getElementById("RoomJoinBtn");
const SDPBtn = document.getElementById("SDPBtn");

const CPCODE = "KP-CCC-demouser-01"
const AUTHKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoidGVzdHNlcnZpY2UiLCJtYXhVc2VyIjoiMTAwIiwic3RhcnREYXRlIjoiMjAyMC0wOC0yMCIsImVuZERhdGUiOiIyMDIwLTEyLTMwIiwiYXV0aENvZGUiOiJLUC1DQ0MtdGVzdHNlcnZpY2UtMDEiLCJjb21wYW55Q29kZSI6IkxJQy0wMyIsImlhdCI6MTU5Nzk3NjQ3Mn0.xh_JgK67rNPufN2WoBa_37LzenuX_P7IEvvx5IbFZI4"

let members;
let roomId;
let userId;
let host;

let peers = {};
let streams = {};

/********************** 기타 method **********************/

//로그출력
const socketLog = (type, contents) => {
    let jsonContents = JSON.stringify(contents);
    const textLine = document.createElement("p");
    const textContents = document.createTextNode(`[${type}] ${jsonContents}`);
    textLine.appendChild(textContents);
    printBox.appendChild(textLine);
}

//send message to signaling server
const sendData = data => {
    data.cpCode = CPCODE
    data.authKey = AUTHKEY
    socketLog('send', data);
    clientIo.emit("knowledgetalk", data);
}


//영상 출력 화면 Box 생성하는 부분
const createVideoBox = id => {
    let videoContainner = document.createElement("div");
    videoContainner.classList = "multi-video";
    videoContainner.id = id;

    let videoLabel = document.createElement("p");
    let videoLabelText = document.createTextNode(id);
    videoLabel.appendChild(videoLabelText);

    videoContainner.appendChild(videoLabel);

    let multiVideo = document.createElement("video");
    multiVideo.autoplay = true;
    multiVideo.id = "multiVideo-" + id;
    videoContainner.appendChild(multiVideo);

    videoBox.appendChild(videoContainner);
}

  

//Local stream, peer 생성 및 sdp return
/* RTCPeerConnection : local 과 원격 peer 간의 webRTC연결을 담당하며 원격피어에 연결하기
                       위한 method 제공.(연결을 유지하고 , 연결상태 모니터링 통해서 연결이 필요하지 않으면 종료)
   */
const createSDPOffer = async id => {
    return new Promise(async (resolve, reject) => {
        peers[id] = new RTCPeerConnection();
        //await 사용해 비동기방식으로 비디오 , 오디오 요청
        streams[id] = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        let str = 'multiVideo-'+id;
        let multiVideo = document.getElementById(str);
        // strams 안에 담긴것을 가져오고 담긴것을 getTracks 사용해서 트랙을 가져온다.
        multiVideo.srcObject = streams[id]; 
        streams[id].getTracks().forEach(track => {
            peers[id].addTrack(track, streams[id]);
        });


        /* sdp : session 프로토콜에 일종 
                 offer/answer 을 통해서 동작한다.
        */
        //수신자에게 전달할 sdp생성하는 부분
        peers[id].createOffer().then(sdp => {
            peers[id].setLocalDescription(sdp);
            return sdp;
        }).then(sdp => {
            resolve(sdp);
        })
    })
}


//send sdp answer
// 
const createSDPAnswer = async data => {
    let displayId = data.displayId;


    peers[displayId] = new RTCPeerConnection();
    peers[displayId].ontrack = e => {
        streams[displayId] = e.streams[0];

        let multiVideo = document.getElementById(`multiVideo-${displayId}`);
        multiVideo.srcObject = streams[displayId];
    }

    await peers[displayId].setRemoteDescription(data.sdp);
    let answerSdp = await peers[displayId].createAnswer();
    await peers[displayId].setLocalDescription(answerSdp);
    peers[displayId].onicecandidate = e => {
        if(!e.candidate){
            let reqData = {
                "eventOp": "SDP",
                "sdp": peers[displayId].localDescription,
                "roomId": data.roomId,
                "usage": "cam",
                "pluginId": data.pluginId,
                "userId": userId
            };

            sendData(reqData);
        }
    }
}

//퇴장 시, stream,peer 제거하는 메서드
const leaveParticipant = id => {
    document.getElementById(`multiVideo-${id}`).remove();
    document.getElementById(id).remove();

    if(streams[id]){
        streams[id].getVideoTracks()[0].stop();
        streams[id].getAudioTracks()[0].stop();
        streams[id] = null;
        delete streams[id];
    }

    if(peers[id]){
        peers[id].close();
        peers[id] = null;
        delete peers[id];
    }

}



/********************** button event **********************/
// create , Roomjoin 버튼 누르면 이벤트 발생
CreateRoomBtn.addEventListener('click', () => {
    host = true;
    let data = {
        "eventOp":"CreateRoom"
    }

    sendData(data);
});

RoomJoinBtn.addEventListener('click', () => {
    let data = {
        "eventOp":"RoomJoin",
        "roomId": roomIdInput.value
    }

    sendData(data);
});
// SDP 라는 버튼을 클릭시 이벤트발생하는 data에 객체를 담아서 서버로 보낸다.
SDPBtn.addEventListener('click', async () => {

    let sdp = await createSDPOffer(userId);

    let data = {
        "eventOp":"SDP",
        "pluginId": undefined,
        "roomId": roomIdInput.value,
        "sdp": sdp,
        "usage": "cam",
        "userId": userId,
        "host": host
    }

    sendData(data);
})



/********************** event receive **********************/
// 위에서 받은 데이터값을 처리하는 부분
clientIo.on("knowledgetalk", async data => {

    socketLog('receive', data);

    switch(data.eventOp || data.signalOp) {
        //data.code 값이 200 이면 방생성
        case 'CreateRoom':
            if(data.code == '200'){
                createRoom(data);
                CreateRoomBtn.disabled = true;
            }
            break;
            
        case 'RoomJoin':
            if(data.code == '200'){
                roomJoin(data);
                RoomJoinBtn.disabled = true;
                CreateRoomBtn.disabled = true;
            }
            break;

        case 'StartSession':
            startSession(data);
            break;

        /*서버에서 data 객체를 받은것을 처리하는데 data.useMediaSvr == Y 일경우 영상회의 시작
           타입은 2가지 경우가있는데 offer , answer 
        */
        case 'SDP':
            if(data.useMediaSvr == 'N'){
                if(data.sdp && data.sdp.type == 'offer'){
                    createSDPAnswer(data);
                }
                else if(data.sdp && data.sdp.type == 'answer'){
                    peers[userId].setRemoteDescription(new RTCSessionDescription(data.sdp));
                }
            }
            break;
        case 'ReceiveFeed':
            receiveFeed(data)
            break;

        case 'Presence':
            if(data.action == 'exit'){
                leaveParticipant(data.userId)
            }
            break;

    }

});

// 

const createRoom = data => {
    roomIdInput.value = data.roomId;

    //room id copy to clipboard
    roomIdInput.select();
    roomIdInput.setSelectionRange(0, 99999);
    document.execCommand("copy");

    alert('room id copied')
}

const roomJoin = data => {
    userId = data.userId;
}

const startSession = async data => {
    members = Object.keys(data.members);

  
 
    if(data.useMediaSvr == 'N'){
        for(let i=0; i<members.length; ++i){ 
            let user = document.getElementById(members[i]);
            if(!user){
                createVideoBox(members[i]);
            }
        }
    
        SDPBtn.disabled = false;
        host = data.host;
    }
}

const receiveFeed = (data) => {
    data.feeds.forEach(result => {
        let data = {
            "eventOp":"SendFeed",
            "roomId": roomIdInput.value,
            "usage": "cam",
            "feedId": result.id,
            "display": result.display
        }

        sendData(data);
    })
}
