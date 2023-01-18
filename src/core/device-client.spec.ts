import { generateDeviceId, setupTestingDeps } from '@testing';
import { skip } from 'rxjs/operators';
import { DeviceClient } from './device-client';
import { ServiceClient } from './service-client';

const MODEL_ID = 'dtmi:wuh:sterilizer:Device;1';
const DEFAULT_INITIAL_DESIRED_PROPS = { deviceInfo: { claimed: false } };

describe('DeviceClient', () => {
  const deviceId = generateDeviceId('ut-deviceClient');

  let deviceClient: DeviceClient<any>;
  let serviceClient: ServiceClient;

  beforeAll(async () => {
    [deviceClient, serviceClient] = await setupTestingDeps(deviceId, MODEL_ID);
  });

  afterEach(async () => {
    await deviceClient.clearReportedProperties();
  });

  afterAll(async () => {
    await deviceClient.disconnect();
    await serviceClient.removeDevice();
  });

  it('[static create] should create a client instance and connect to the IoT Hub', async () => {
    expect(deviceClient).toBeDefined();
    expect(deviceClient.modelId).toEqual(MODEL_ID);
  });

  it('[reportProperties] should report device twin properties', async () => {
    let reportedProps = await deviceClient.getReportedProperties();

    expect(reportedProps).toEqual({});

    const reportObj = {
      foo: 'bar',
      baz: {
        hurr: 'durr',
      },
    };

    await deviceClient.reportProperties(reportObj);

    reportedProps = await deviceClient.getReportedProperties();

    expect(reportedProps).toEqual(reportObj);
  });

  it('[getDesiredProperties] should return desired device twin properties', async () => {
    const desired = await deviceClient.getDesiredProperties();

    expect(desired).toEqual(DEFAULT_INITIAL_DESIRED_PROPS);
  });

  it('[sendTelemetry] should send a telemetry message in IoDent format', async () => {
    const telemetryType = 'test-type';
    const telemetryContent = {
      foo: 'bar',
    };

    expect(deviceClient.sendTelemetry({ type: telemetryType, payload: telemetryContent })).resolves.toBeUndefined();
  });

  it('[connected$] should emit on connection', done => {
    deviceClient.disconnect().then(() => deviceClient.connect());

    deviceClient.connected$.pipe(skip(1)).subscribe(() => done());
  });

  it('[disconnected$] should emit on disconnect', done => {
    deviceClient.disconnect();

    deviceClient.disconnected$.subscribe(() => done());
  });
});
