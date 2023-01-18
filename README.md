# azure-iot-pnp

This Azure IoT Hub abstraction features first class citizen support for pnp components and identity certificate
retrieval via SCEP.

## Features

- Following Azure Plug and Play Component conventions
- Sending DeviceTwin desired change acknowledgements out of the box. Handling can easily be adapted if needed.
- Adding telemetry type metadata per default to utilize the whole payload for data instead of spreading routing
  information in it
- Very lightweight component implementation

### Component implementation

````typescript
export const enum DeviceState {
  Idle = 'idle',
  Updating = 'updating',
  Processing = 'processing',
  Error = 'error',
}

export type FeatureActivation = 'activated' | 'deactivated';

export interface MyComponentState {
  featureA: FeatureActivation;
  state: DeviceState
}

export const componentKey = 'my-component';

export class MyPnPComponent extends PnPComponent<MyComponentState> {
  constructor(deviceClient: DeviceClient<{ [componentKey]: MyComponentState }>) {
    super(deviceClient, componentKey);
  }

  toggle(): Promise<void> {
    return this.reportState(({ toggle }) => ({
      toggle: toggle === 'activated' ? 'deactivated' : 'activated',
    }));
  }

  setState(state: DeviceState): Promise<void> {
    return this.reportState({ state });
  }
}
````

## Prerequisites

This library relies on the presence of the openssl and sscep library on the consuming system.
If they're not installed with a global scope (executable just with their name instead of the full binary path),
paths to the executables can be specified using the `OPENSSL_PATH` and the `SSCEP_PATH` environment variables
respectively.

## Plug and Play Components

Azure IoT Hub features so-called Plug and Play components, that can be defined within the device's Plug and Play model
definition written in DTDL (Device Twin Definition Language)
This library provides first class citizen support for usage

## SCEP

For the SCEP certificate enrollment you need a working SCEP server who's linked CA certificate is configured in the IoT
Hub.
With that you can easily gather or renew/enroll new identity certificates to your devices (also very handy for testing)
