import React from 'react';
import { broadcastData, JOIN_CALL, LEAVE_CALL, EXCHANGE, lightsCamera, ice } from './video_util.jsx'
import {connect} from 'react-redux'
import { merge } from 'lodash'
const msp = state =>({
    current_user: state.session.currentUser
})
class VideoCall extends React.Component{
    constructor(props){
        super(props)
        this.pcPeers = {};
        this.state = {active: false};
        
    }
    //ice = ice credentials
    //pcPeers + localStream are objects

    // localVideo + remoteVideoContainer are DOM elements

    componentDidMount(){


        this.localVideo = document.getElementById("local-video"),
        this.remoteVideoContainer = document.getElementById("remote-video-container")
        lightsCamera.bind(this)();
    }

    joinCall (e){
        //connect to action cable
        //switch on broadcasted data.type and decide what to do from there
        e.preventDefault();
        const that = this;
        const me = this.props.current_user;
        App.cable.subscriptions.create(
            { channel: "VideoChannel", id: "76"},
            {
                connected: () => {
                    console.log("connected")
                    broadcastData({
                        type: JOIN_CALL, 
                        from: me, 
                        id: "76" 
                    });
                },
                received: data =>{
                    console.log("received:", data);
                    if (data.from === me) return;
                    switch(data.type) {
                        case JOIN_CALL:
                            return this.join(data);
                        case EXCHANGE:
                            if (data.to !== me) return;
                            return this.exchange(data);
                        case LEAVE_CALL:
                            return this.removeUser(data);
                        default:
                            return;
                    }
                },
            });
        
        
    }
    
    leaveCall(e){
        //disconnect from the action cable
        e.preventDefault();
        const pcKeys = Object.keys(this.pcPeers);
        for(let i = 0; i < pcKeys.length; i++){
            this.pcPeers[pcKeys[i]].close();
        }
        this.pcPeers = {};
        this.localVideo.srcObject.getTracks().forEach( function (track){
            track.stop();
        })
        this.localVideo.srcObject = null;
        App.cable.subscriptions.subscriptions = [];
      
        this.remoteVideoContainer.innerHTML = "";
        broadcastData({
            type: REMOVE_USER,
            from: this.props.current_user,
            id: "76"
        });
    }

    join(data){
        this.createPC(data.from, true)
    }
    removeUser(data){
        console.log("removing user", data.from);
        let video = document.getElementById(`remoteVideoContainer+${data.from}`);
        video && video.remove();

        let peers = this.pcPeers
        delete peers[data.from]
    }
    createPC(userId, isOffer){

        //create a new instance of a RTCPeerConnection line 92
        //potentially create an "offer" line 98
        //exchange SDP line 100
        //exchange ICE line 108
        //add the stream line 118
        //return an instance of peer connection line 134
        let pc = new RTCPeerConnection(ice)

        this.pcPeers[userId] = pc;


        console.log(this.localStream)
        console.log(pc)
        this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));

        let that = this;
        if (isOffer){
            pc.createOffer().then(offer => {
                pc.setLocalDescription(offer).then( ()=> {
                    broadcastData({
                        type: EXCHANGE,
                        from: that.props.current_user,
                        to: userId,
                        sdp: JSON.stringify(pc.localDescription),
                        id: "76"
                    })
                });

            });
        }
        pc.onicecandidate = (e) => {
            if (e.candidate){
                broadcastData({
                    type: EXCHANGE,
                    from: that.props.current_user,
                    to: userId,
                    sdp: JSON.stringify(e.candidate),
                    id: "76"
                });
            }
        }
        pc.ontrack = e => {
            console.log(e.streams)
            const remoteVid = document.createElement("video");
            remoteVid.id = `remoteVideoContainer+${userId}`;
            remoteVid.autoplay = "autoplay";
            remoteVid.srcObject = e.streams[0];
            const vidContainer = document.getElementById("remote-video-container")
            vidContainer.appendChild(remoteVid);
        };
        pc.oniceconnectionstatechange = e => {
            if (pc.iceConnectionState === 'disconnected'){
                console.log("Disconnected:", userId);
                broadcastData({
                    type: REMOVE_USER,
                    from: userId,
                    id: "76"
                });
            }
        };
        return pc;
    }
    exchange(data){

        const that = this
        let pc;

        if (!this.pcPeers[data.from]){
            pc = this.createPC(data.from, false);
        } else {
            pc = this.pcPeers[data.from];
        }

    
        if (data.candidate){
            let candidate = JSON.parse(data.candidate)
            pc.addIceCandidate(new RTCIceCandidate(candidate))
            .then(() => {console.log("Ice candidate added", candidate)}).catch( (errors) => console.log(errors));
        }
        
        if (data.sdp){
            const sdp = JSON.parse(data.sdp);


                pc.setRemoteDescription(sdp)
                .then(() => {
                    if (sdp.type === "offer") {
                        pc.createAnswer().then(answer => {
                            console.log('got description')
                            pc.setLocalDescription(answer)
                            .then(function (){
                                console.log("Sending SDP:", data.from, answer)
    
                                console.log(answer.type)
                                broadcastData({
                                    type: EXCHANGE,
                                    from: that.props.current_user,
                                    to: data.from,
                                    sdp: JSON.stringify(pc.localDescription),
                                    id: "76"
                                });
                            });
                                
                        }).catch( errors => console.log(errors));
    
                    }
                })


            ;
        }
    }
    render(){
        return (
            <div id='vidContainer' className='video-call'>
                <div id="remote-video-container"></div>
                    <video id="local-video" autoPlay></video>

                    <hr />

                    <button onClick={this.joinCall.bind(this)}>
                        Join Call
                    </button>

                    <button onClick={this.leaveCall.bind(this)}>
                        Leave Call
                    </button>
            </div>
        )
        
    }
}

export default connect (msp, null)(VideoCall);