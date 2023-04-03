window.global ||= window;

// import { HideOnMouseStop } from 'react-hide-on-mouse-stop';
import React, {useState, useEffect} from 'react';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Collapse from '@mui/material/Collapse';
import { useSearchParams} from "react-router-dom";
import ReactPlayer from 'react-player';
import { io } from "socket.io-client";
import { ConnectionSideMenu } from './Components/ConnectionSideMenu';
import { LandingPage } from './Components/LandingPage';
import './App.css';

const wsServerURL = "https://watchparty.herokuapp.com";
const baseClientURL = "https://watch-partyso.netlify.app/?r=";
let copyURL = baseClientURL;
let socket = {};
let type = "pub";
let uName = "";
let room = "";
let vidControl = "";
let seekCycle = 0;
let connected = false;
let disconnected = false;

function App() {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlParam = searchParams.get("r");
    const [videoURL, setVideoURL] = useState("");
    const [playVid, setPlayVid] = useState(true);
    const [otherRoomMembers, setORMs] = useState("");
    const [myData, setMyData] = useState("")
    const [messages, setMessages] = useState([]);
    const [sock, setSock] = useState('Sock');
    const [seekTime, setSeekTime] = useState(0);
    const [toggle, setToggle] = useState(false);
    const [status, setStatus] = useState("Status: Not Connected");
    const [alertType, setAlertType] = useState("info");
    // The below is a function which when called force updates the state. IDK how it works. Don't touch it.
    const [userName, setUname] = useState("Name");
    const [sidebarClicked, setSBClicked] = useState(false);
    const [, updateState] = React.useState();
    const [sidebarVisible, setSidebarVisible] = useState("{opacity:0;}")
    const forceUpdate = React.useCallback(() => updateState({}), []);

    useEffect(
        () => {
            if (urlParam && urlParam.length > 10) {
                room = urlParam
                connectSubscriber(urlParam);
                console.log(room);
            }
        },
        []
    );

    useEffect( 
        () => {
            // console.log("MSG useEffect");
            if (connected) {
                socket.on('CHAT-C', (args) => setMessages([...messages, args]));
                return () => { socket.off('CHT-C'); };
            }
        },[socket,messages]
    );

    useEffect( 
        () => {
            // console.log("Play/Pause useEffect");
            if (connected) {
                socket.on('VC-C', (args) => {    
                    if (args.type === "play")
                        setPlayVid(true);
                    else if (args.type === "pause")
                        setPlayVid(false); 
                });
                return () => { socket.off('VC-C'); };
            }
        },[socket,playVid]
    );

    useEffect( 
        () => {
            // console.log("New members useEffect");
            if (connected) {
                socket.on('MEMS-C', (args) => {setORMs([...otherRoomMembers, args.msg])});
                return () => { socket.off('MEMS-C'); };
            }
        },[socket,otherRoomMembers]
    );

    useEffect( 
        () => {
            // console.log("New seektime useEffect");
            if (connected && type === "sub") {
                socket.on('PGT-C', (args) => {setSeekTime(Math.floor(args.time));})
                return () => { socket.off('PGT-C'); };
            }
        },[socket,seekTime]
    );

    useEffect( 
        () => {
            // console.log("Setting Socket useEffect");
            if (connected) {
                setSock(socket);
                setMyData("Name: " +uName+" type: "+type+" room: "+room);
                setToggle(true);
                setAlertType("success");
                setStatus(myData);
            }
        },[socket, sock, connected]
    );

    useEffect( 
        () => {
            // console.log("disconnecting useEffect");
            if (disconnected) {
                setMyData("You are disconnected");
                setToggle(true);
                setAlertType("error");
                setStatus(myData);
            }
        },[socket, sock, connected]
    );

    useEffect( 
        () => {
            // console.log("Setting uName useEffect");
            if (connected)
                setUname(uName);
        },[socket, userName]
    );

    const connectPublisher = () => {
        // console.log("connecting Pub");
        socket = io(wsServerURL, {
            extraHeaders: {
                type: type,
                uid: localStorage.getItem('pubID') === null ? "0" : localStorage.getItem('pubID')
            }
        });
        socket.on('CONN-STATUS', (args) => {
            if (args.code === 0) {
                socket.on("Main", (args) => {
                    uName = args.username;
                    // localStorage.setItem('userName', uName); // Store uName only when client runs in prod. Don't use this for dev or testing
                    room = args.roomID;
                    copyURL += room;
                    // console.log(uName," connected to room ", room, " as ", type);
                    localStorage.setItem('pubID', args.pubID);
                    connected = true;
                    forceUpdate();
                });
            } else if (args.code == 1) {
                console.log(args);
                socket.off('CONN_STATUS');
                raiseAlert("Could not connect to server. Try again.")
            }
        });
    }

    function connectSubscriber(pubRoomID) {
        // console.log("connecting subscriber");
        socket = io(wsServerURL, {
            extraHeaders: {
            type: "sub",
            roomID: pubRoomID,
            uid: localStorage.getItem('subID') === null ? "0" : localStorage.getItem('subID')
            }
        });

        socket.on('CONN-STATUS', (args) => {
            if (args.code === 0) {
                socket.on(pubRoomID, (args) => {
                    uName = args.username;
                    // localStorage.setItem('userName', uName); // Store uName only when client runs in prod. Don't use this for dev or testing
                    type = "sub";
                    // console.log(uName," connected to room ", room, " as ", type);
                    localStorage.setItem('subID', args.subID);
                    connected = true;
                    listenPubChange(socket);
                    forceUpdate();
                });
            } else if (args.code === 1) {
                console.log(args);
                socket.off('CONN_STATUS');
                raiseAlert("Could not connect to server. RoomID could be incorrect.")
            }
        });
    }

    const listenPubChange = (socket) => {
        socket.on('PUBCH-C', (args) => {type = "pub"});
    }

    const raiseAlert = (str) => {
        setMyData(str);
        setToggle(true);
        setAlertType("error");
        setStatus(myData);
    }

    function onProgress(event) {
        if (type === "sub") {
            if (seekCycle === 0) {
                const currTime = Math.floor(event.playedSeconds);
                if (Math.abs(currTime-seekTime) > 1)
                    vidControl.seekTo(seekTime);
                seekCycle = 6;
            }
            seekCycle--;
        }
        else if (type === "pub" && connected)
            socket.emit('PGT-S', {time:event.playedSeconds});      
    }

    function playPause(event) {
        if (typeof event != "undefined" && event.type === "pause") {
            socket.emit('VC-S', { type: "pause" });
        } else {
            socket.emit('VC-S', { type: "play"});
        }
    }

    function handleChangeURL(event)  { setVideoURL(global.URL.createObjectURL(event.target.files[0])); }
    function ref(p) { vidControl = p; }
    function copyURLf() { navigator.clipboard.writeText(copyURL); }

    function disc() {
        if (connected) {
            socket.disconnect();
            connected = false;
            disconnected = true;
            raiseAlert("You are disconnected from server");
        }
    }

  

    return (
        <>
            {
            videoURL === "" ?             
            <LandingPage type={type}></LandingPage>
            : console.log("landing page removed")
            }
    
            
            {/* <div className="arrows-wrapper">
                <div className="arrow arrow-first"></div>
                <div className="arrow arrow-second"></div>
                <div className="arrow arrow-third"></div>
            </div> */}

            <div className={"alerts-wrapper-main"}>
                <Collapse in={toggle}>
                    <Alert severity={alertType}
                        action={
                            <IconButton
                                aria-label="close"
                                color="inherit"
                                size="small"
                                onClick={() => {
                                    setToggle(false);
                                }}>
                            <CloseIcon fontSize="inherit" />
                            </IconButton>
                        }
                        sx={{ mb: 2 }}>
                        {status}
                    </Alert>
                </Collapse>
            </div>

            {/* <HideOnMouseStop delay={1000} defaultTransition hideCursor> */}
                <ConnectionSideMenu visible={sidebarVisible} myData={myData} disc={disc} membersData={otherRoomMembers} name={userName} socket={sock} messages={messages} con={connectPublisher} chURL={handleChangeURL} copyURL={copyURLf} />
            {/* </HideOnMouseStop> */}

            <div className={"vidWrapper"}>
                <div className={"vidContainer"}>
                    <ReactPlayer ref={ref} url={videoURL} playing={playVid} className="react-player" controls width="100%" height="100%"  onProgress={onProgress} onPause={playPause} onPlay={playPause}/>
                </div>
            </div>

        </>
    );
}

export default App;
