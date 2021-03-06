import React from 'react';
import { broadcastData, JOIN_CALL, LEAVE_CALL, EXCHANGE, ice } from './video_util.jsx'
import {connect} from 'react-redux'

const msp = state =>({
    current_user: state.session.currentUser
})
class VideoCall extends React.Component{

    constructor(props){
        super(props)
        this.pcPeers = {};    
    }

    componentDidMount(){
        this.localVideo = document.getElementById("local-video");
        this.remoteVideoContainer = document.getElementById("remote-video-container");
        navigator.mediaDevices.getUserMedia(
            {
                audio: true,
                video: true
            }
        ).then(stream => {
            this.localStream = stream;
            this.localVideo.srcObject = stream;
        }).catch((error) => { console.log(error) });
    }

    componentDidUpdate(){
        this.localVideo = document.getElementById("local-video");
        navigator.mediaDevices.getUserMedia(
            {
                audio: true,
                video: true
            }
        ).then(stream => {
            this.localStream = stream;
            this.localVideo.srcObject = stream;
        }).catch((error) => {console.log(error)});

    }
    componentWillUnmount(){
        const pcKeys = Object.keys(this.pcPeers);
        for (let i = 0; i < pcKeys.length; i++) {
            this.pcPeers[pcKeys[i]].close();
        }
        App.cable.subscriptions.subscriptions = [];
        broadcastData({
            type: LEAVE_CALL,
            from: this.props.current_user,
            id: "76"
        });
    }

    joinCall (e){
        //connect to action cable
        //switch on broadcasted data.type and decide what to do from there

        e.preventDefault();
        const me = this.props.current_user;
        App.cable.subscriptions.create(
            { channel: "VideoChannel", id: "76"},
            {
                connected: () => {
                    setTimeout( () => {
                        broadcastData({
                            type: JOIN_CALL, 
                            from: me, 
                            id: "76" 
                        });
                    }, 0)
                },
                received: data =>{
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
            type: LEAVE_CALL,
            from: this.props.current_user,
            id: "76"
        });
  
        this.props.DMDetail.setState({videoCall: false})
    }

    join(data){
        this.createPC(data.from, true)
    }
    removeUser(data){
        let video = document.getElementById(`remoteVideoContainer+${data.from}`);
        video && video.remove();

        let peers = this.pcPeers
        delete peers[data.from]
    }
    createPC(userId, isOffer){

    
        let pc = new RTCPeerConnection(ice)
        this.pcPeers[userId] = pc;
        let vidcount = 0;
        this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream));

        let that = this;
        if (isOffer){
            pc.createOffer().then(offer => {
                pc.setLocalDescription(offer).then( ()=> {
                    
                    setTimeout( () => {
                        broadcastData({
                        type: EXCHANGE,
                        from: that.props.current_user,
                        to: userId,
                        sdp: JSON.stringify(pc.localDescription),
                        id: "76"
                        })
                }, 0); 
                });

            });
        }
        pc.onicecandidate = (e) => {
            if (e.candidate){
                setTimeout(() => {
                    broadcastData({
                        type: EXCHANGE,
                        from: that.props.current_user,
                        to: userId,
                        sdp: JSON.stringify(e.candidate),
                        id: "76"
                    });
                }, 0); 
            }
        }
        pc.ontrack = e => {
            if (vidcount === 0){
                const remoteVid = document.createElement("video");
                remoteVid.id = `remoteVideoContainer+${userId}`;
                remoteVid.autoplay = "autoplay";
                remoteVid.srcObject = e.streams[0];
                this.remoteVideoContainer.appendChild(remoteVid);
                vidcount++
            }
        };
        pc.oniceconnectionstatechange = e => {
            if (pc.iceConnectionState === 'disconnected'){

                broadcastData({
                    type: LEAVE_CALL,
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
        }
        
        if (data.sdp){
            const sdp = JSON.parse(data.sdp);
            
            if (sdp && !sdp.candidate){
                pc.setRemoteDescription(sdp).then(() => {
                    if (sdp.type === "offer") {
                        pc.createAnswer().then(answer => {
                            // console.log('got description')
                            pc.setLocalDescription(answer)
                            .then( () => {
                                setTimeout( () => {
                                    broadcastData({
                                        type: EXCHANGE,
                                        from: that.props.current_user,
                                        to: data.from,
                                        sdp: JSON.stringify(pc.localDescription),
                                        id: "76"
                                    });
                                }, 0);
                            });
                                
                        }).catch( errors => console.log(errors));
    
                    }
                }).catch( (errors) => console.log(errors));

            }
        }
    }
    render(){
        return (
            <div id='vidContainer' className='video-call'>
                <div id="remote-video-container"></div>
                    <video id="local-video" muted autoPlay></video>
                    <div className='video-functions'>

                    <button className='join-call' onClick={this.joinCall.bind(this)}>
                        Join Call
                    </button>

                    <button className='leave-call'onClick={this.leaveCall.bind(this)}>
                            Leave Call
                        </button>
                    </div>
            </div>
        )
        
    }
}

export default connect (msp, null)(VideoCall);