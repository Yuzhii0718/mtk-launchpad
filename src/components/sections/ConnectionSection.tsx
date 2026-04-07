import { useTranslation } from 'react-i18next'
import { CHIP_CONFIG, CHIP_OPTIONS } from '../../constants'
import type { Chip, DdrType, SerialDataBits, SerialParity, SerialStopBits } from '../../types'

type ConnectionSectionProps = {
  detectedPortInfo: string
  connectBaudRate: number
  connectBaudRateOption: string
  customConnectBaudRate: number
  connectDataBits: SerialDataBits
  connectStopBits: SerialStopBits
  connectParity: SerialParity
  isConnected: boolean
  isRunning: boolean
  chip: Chip
  ddr: DdrType
  ddrOptions: DdrType[]
  loadAddress: number
  bromLoadBaudRate: number
  bl2LoadBaudRate: number
  onConnectBaudRateSelect: (value: string) => void
  onCustomConnectBaudRateInput: (value: string) => void
  onConnectDataBitsChange: (value: SerialDataBits) => void
  onConnectStopBitsChange: (value: SerialStopBits) => void
  onConnectParityChange: (value: SerialParity) => void
  onChipChange: (value: Chip) => void
  onDdrChange: (value: DdrType) => void
  onLoadAddressInput: (value: string) => void
  onBromBaudRateInput: (value: string) => void
  onBl2BaudRateInput: (value: string) => void
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
  onForgetDevice: () => Promise<void>
}

export function ConnectionSection(props: ConnectionSectionProps) {
  const { t } = useTranslation()
  const {
    detectedPortInfo,
    connectBaudRate,
    connectBaudRateOption,
    customConnectBaudRate,
    connectDataBits,
    connectStopBits,
    connectParity,
    isConnected,
    isRunning,
    chip,
    ddr,
    ddrOptions,
    loadAddress,
    bromLoadBaudRate,
    bl2LoadBaudRate,
    onConnectBaudRateSelect,
    onCustomConnectBaudRateInput,
    onConnectDataBitsChange,
    onConnectStopBitsChange,
    onConnectParityChange,
    onChipChange,
    onDdrChange,
    onLoadAddressInput,
    onBromBaudRateInput,
    onBl2BaudRateInput,
    onConnect,
    onDisconnect,
    onForgetDevice,
  } = props

  return (
    <section className="card grid two-cols">
      <div>
        <h2>{t('connectTitle')}</h2>
        <p className={`status ${isConnected ? 'ok' : 'warn'}`}>
          {isConnected ? t('connected') : t('disconnected')}
        </p>
        <div className="field-row">
          <label>{t('detectedPort')}</label>
          <input value={detectedPortInfo} readOnly />
        </div>
        <p className="hint">{t('detectedPortHint')}</p>
        <div className="field-row">
          <label>{t('baudRate')}</label>
          <div className="baudrate-row">
            <select
              value={connectBaudRateOption}
              onChange={(event) => onConnectBaudRateSelect(event.target.value)}
            >
              <option value="4800">4800</option>
              <option value="9600">9600</option>
              <option value="14400">14400</option>
              <option value="19200">19200</option>
              <option value="38400">38400</option>
              <option value="57600">57600</option>
              <option value="115200">115200</option>
              <option value="custom">{t('customBaudRate')}</option>
            </select>
            {connectBaudRateOption === 'custom' && (
              <input
                type="number"
                value={customConnectBaudRate}
                placeholder={t('customBaudRatePlaceholder')}
                onChange={(event) => onCustomConnectBaudRateInput(event.target.value)}
              />
            )}
          </div>
          <p className="hint">{t('selectedBaudRate')}: {connectBaudRate}</p>
        </div>
        <div className="serial-params-row">
          <div className="serial-param">
            <label>{t('dataBits')}</label>
            <select
              value={connectDataBits}
              onChange={(event) => onConnectDataBitsChange(Number(event.target.value) as SerialDataBits)}
            >
              <option value={8}>8</option>
              <option value={7}>7</option>
            </select>
          </div>
          <div className="serial-param">
            <label>{t('stopBits')}</label>
            <select
              value={connectStopBits}
              onChange={(event) => onConnectStopBitsChange(Number(event.target.value) as SerialStopBits)}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
          <div className="serial-param">
            <label>{t('parity')}</label>
            <select
              value={connectParity}
              onChange={(event) => onConnectParityChange(event.target.value as SerialParity)}
            >
              <option value="none">{t('parityNone')}</option>
              <option value="even">{t('parityEven')}</option>
              <option value="odd">{t('parityOdd')}</option>
            </select>
          </div>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => void onConnect()} disabled={isConnected}>
            {t('connect')}
          </button>
          <button type="button" onClick={() => void onDisconnect()} disabled={!isConnected}>
            {t('disconnect')}
          </button>
          <button type="button" onClick={() => void onForgetDevice()} disabled={!isConnected || isRunning}>
            {t('forgetDevice')}
          </button>
        </div>
      </div>

      <div>
        <h2>{t('firmwareLabel')}</h2>
        <div className="field-row">
          <label>{t('chip')}</label>
          <select value={chip} onChange={(event) => onChipChange(event.target.value as Chip)}>
            {CHIP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {CHIP_CONFIG[option].label}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label>{t('ddr')}</label>
          <select value={ddr} onChange={(event) => onDdrChange(event.target.value as DdrType)}>
            {ddrOptions.map((option) => (
              <option key={option} value={option}>
                {option.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label>{t('loadAddress')}</label>
          <input
            type="number"
            value={loadAddress}
            onChange={(event) => onLoadAddressInput(event.target.value)}
          />
        </div>
        <div className="field-row">
          <label>{t('bromBaudRate')}</label>
          <input
            type="number"
            value={bromLoadBaudRate}
            onChange={(event) => onBromBaudRateInput(event.target.value)}
          />
        </div>
        <div className="field-row">
          <label>{t('bl2BaudRate')}</label>
          <input
            type="number"
            value={bl2LoadBaudRate}
            onChange={(event) => onBl2BaudRateInput(event.target.value)}
          />
        </div>
      </div>
    </section>
  )
}
