"""
CarePing bedside-button simulator.

Publishes to Mosquitto exactly what a real ESP32 button would:
  careping/<CODE>/request   {"type": "water"}        when the button is pressed
  careping/<CODE>/status    {"status": "online"}     heartbeat every loop
and prints the acknowledgements the web console sends back on
  careping/<CODE>/ack       {"state": "otw", "by": "Nurse Noon", ...}

Usage
  python Payload.py                    random presses every 15-30 s (Ctrl+C to stop)
  python Payload.py CP-7F3A water      one press from one button, then exit
"""
import json
import random
import sys
import time

import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT = 1883
BUTTONS = ["CP-7F3A", "CP-21B9", "CP-0C44", "CP-9D10", "CP-A817"]
TYPES = ["water", "water", "toilet", "toilet", "pain", "help"]


def on_message(client, userdata, msg):
    print(f"  ← {msg.topic}: {msg.payload.decode(errors='replace')}")


def press(client, code, kind):
    client.publish(f"careping/{code}/request", json.dumps({"type": kind}), qos=1)
    print(f"→ {code} pressed: {kind}")


def main():
    client = mqtt.Client()
    client.on_message = on_message
    client.connect(BROKER, PORT)
    client.subscribe("careping/+/ack")
    client.loop_start()

    if len(sys.argv) == 3:
        press(client, sys.argv[1].upper(), sys.argv[2].lower())
        time.sleep(1)
    else:
        print("Simulating CarePing buttons. Press Ctrl+C to stop.")
        try:
            while True:
                for code in BUTTONS:
                    client.publish(f"careping/{code}/status", json.dumps({"status": "online"}))
                press(client, random.choice(BUTTONS), random.choice(TYPES))
                time.sleep(random.randint(15, 30))
        except KeyboardInterrupt:
            pass

    client.loop_stop()
    client.disconnect()


if __name__ == "__main__":
    main()
