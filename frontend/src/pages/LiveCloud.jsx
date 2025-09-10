import { useEffect, useState } from "react";    
export default function LiveCloud() {
    const ROOM_URL = import.meta.env.VITE_DAILY_ROOM_URL; // e.g. https://xxx.daily.co/demo
    return (
      <div className="container" style={{paddingTop:"6vh", paddingBottom:"6vh"}}>
        <div className="card">
          <div className="card-header">Live (Cloud)</div>
          <div className="card-body">
            <iframe
              src={`${ROOM_URL}?autojoin=1`}
              allow="camera; microphone; display-capture; autoplay; clipboard-write; fullscreen; speaker-selection"
              className="video"
              style={{height:"75vh", border:"0"}}
              title="Daily Prebuilt Call"
            />
          </div>
        </div>
      </div>
    );
  }
  