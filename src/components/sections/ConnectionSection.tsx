import { useTranslation } from 'react-i18next'
import { CHIP_CONFIG, CHIP_OPTIONS } from '../../constants'
import type { Chip, DdrType } from '../../types'

type ConnectionSectionProps = {
  detectedPortInfo: string
  connectBaudRate: number
  isConnected: boolean
  isRunning: boolean
  chip: Chip
  ddr: DdrType
  ddrOptions: DdrType[]
  loadAddress: number
  bromLoadBaudRate: number
  bl2LoadBaudRate: number
  onConnectBaudRateInput: (value: string) => void
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
    isConnected,
    isRunning,
    chip,
    ddr,
    ddrOptions,
    loadAddress,
    bromLoadBaudRate,
    bl2LoadBaudRate,
    onConnectBaudRateInput,
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
        <p className="hint">{t('webSerialLimit')}</p>
        <div className="field-row">
          <label>{t('detectedPort')}</label>
          <input value={detectedPortInfo} readOnly />
        </div>
        <p className="hint">{t('detectedPortHint')}</p>
        <div className="field-row">
          <label>{t('baudRate')}</label>
          <input
            type="number"
            value={connectBaudRate}
            onChange={(event) => onConnectBaudRateInput(event.target.value)}
          />
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
        <p className={`status ${isConnected ? 'ok' : 'warn'}`}>
          {isConnected ? t('connected') : t('disconnected')}
        </p>
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
