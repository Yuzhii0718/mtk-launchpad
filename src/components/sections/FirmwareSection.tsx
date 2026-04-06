import { useTranslation } from 'react-i18next'
import type { FirmwareCandidate, FirmwareSource } from '../../types'
import { candidateKey, formatCandidateLabel } from '../../utils/fileNameParsers'
import { Md5Line } from '../Md5Line'

type LoadMode = 'bl2-only' | 'bl2-fip'

type FirmwareSectionProps = {
  loadMode: LoadMode
  bl2Source: FirmwareSource
  fipSource: Exclude<FirmwareSource, 'builtin'>
  bl2ReleaseApi: string
  bl2ReleaseTag: string
  isLoadingBl2Release: boolean
  fipReleaseApi: string
  fipReleaseTag: string
  isLoadingFipRelease: boolean
  boardFilter: string
  builtinBl2Options: FirmwareCandidate[]
  releaseBl2Options: FirmwareCandidate[]
  releaseFipOptions: FirmwareCandidate[]
  selectedBuiltinBl2Key: string
  selectedReleaseBl2Key: string
  selectedExecutionRemoteBl2Candidate?: FirmwareCandidate
  selectedReleaseFipKey: string
  selectedExecutionRemoteFipCandidate?: FirmwareCandidate
  canDownloadRambootPreloader: boolean
  canUseRemoteBl2ForExecution: boolean
  canDownloadBoardBl2: boolean
  canDownloadFip: boolean
  canUseRemoteFipForExecution: boolean
  bl2ExpectedMd5?: string
  bl2ActualMd5?: string
  bl2Md5Passed: boolean | null
  fipExpectedMd5?: string
  fipActualMd5?: string
  fipMd5Passed: boolean | null
  onLoadModeChange: (value: LoadMode) => void
  onBl2SourceChange: (value: FirmwareSource) => void
  onBl2ReleaseApiChange: (value: string) => void
  onFetchBl2Release: () => Promise<void>
  onSelectedBuiltinBl2KeyChange: (value: string) => void
  onSelectedReleaseBl2KeyChange: (value: string) => void
  onUseRemoteBl2ForExecution: () => Promise<void>
  onDownloadRambootPreloader: () => Promise<void>
  onUploadedBl2FileChange: (file: File | null) => void
  onRunBl2Md5Check: () => Promise<void>
  onFipSourceChange: (value: Exclude<FirmwareSource, 'builtin'>) => void
  onFipReleaseApiChange: (value: string) => void
  onBoardFilterChange: (value: string) => void
  onFetchFipRelease: () => Promise<void>
  onSelectedReleaseFipKeyChange: (value: string) => void
  onUseRemoteFipForExecution: () => Promise<void>
  onDownloadBoardBl2: () => Promise<void>
  onDownloadFip: () => Promise<void>
  onUploadedFipFileChange: (file: File | null) => void
  onRunFipMd5Check: () => Promise<void>
}

export function FirmwareSection(props: FirmwareSectionProps) {
  const { t } = useTranslation()
  const {
    loadMode,
    bl2Source,
    fipSource,
    bl2ReleaseApi,
    bl2ReleaseTag,
    isLoadingBl2Release,
    fipReleaseApi,
    fipReleaseTag,
    isLoadingFipRelease,
    boardFilter,
    builtinBl2Options,
    releaseBl2Options,
    releaseFipOptions,
    selectedBuiltinBl2Key,
    selectedReleaseBl2Key,
    selectedExecutionRemoteBl2Candidate,
    selectedReleaseFipKey,
    selectedExecutionRemoteFipCandidate,
    canDownloadRambootPreloader,
    canUseRemoteBl2ForExecution,
    canDownloadBoardBl2,
    canDownloadFip,
    canUseRemoteFipForExecution,
    bl2ExpectedMd5,
    bl2ActualMd5,
    bl2Md5Passed,
    fipExpectedMd5,
    fipActualMd5,
    fipMd5Passed,
    onLoadModeChange,
    onBl2SourceChange,
    onBl2ReleaseApiChange,
    onFetchBl2Release,
    onSelectedBuiltinBl2KeyChange,
    onSelectedReleaseBl2KeyChange,
    onUseRemoteBl2ForExecution,
    onDownloadRambootPreloader,
    onUploadedBl2FileChange,
    onRunBl2Md5Check,
    onFipSourceChange,
    onFipReleaseApiChange,
    onBoardFilterChange,
    onFetchFipRelease,
    onSelectedReleaseFipKeyChange,
    onUseRemoteFipForExecution,
    onDownloadBoardBl2,
    onDownloadFip,
    onUploadedFipFileChange,
    onRunFipMd5Check,
  } = props

  return (
    <section className={`card grid ${loadMode === 'bl2-fip' ? 'two-cols' : ''}`}>
      <div>
        <h2>{t('rambootBl2Source')}</h2>
        <div className="field-row">
          <label>{t('loadMode')}</label>
          <select value={loadMode} onChange={(event) => onLoadModeChange(event.target.value as LoadMode)}>
            <option value="bl2-only">{t('bl2Only')}</option>
            <option value="bl2-fip">{t('bl2AndFip')}</option>
          </select>
        </div>

        <div className="field-row">
          <label>{t('rambootBl2Source')}</label>
          <select value={bl2Source} onChange={(event) => onBl2SourceChange(event.target.value as FirmwareSource)}>
            <option value="builtin">{t('builtin')}</option>
            <option value="github-release">{t('githubRelease')}</option>
            <option value="upload">{t('uploadLocal')}</option>
          </select>
        </div>

        {bl2Source === 'builtin' && (
          <div className="field-row">
            <label>{t('chooseBl2')}</label>
            <select
              className="candidate-select"
              value={selectedBuiltinBl2Key}
              onChange={(event) => onSelectedBuiltinBl2KeyChange(event.target.value)}
            >
              {builtinBl2Options.map((candidate) => (
                <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                  {formatCandidateLabel(candidate)}
                </option>
              ))}
            </select>
          </div>
        )}

        {bl2Source === 'github-release' && (
          <>
            <div className="field-row">
              <label>{t('bl2ReleaseApi')}</label>
              <input value={bl2ReleaseApi} onChange={(event) => onBl2ReleaseApiChange(event.target.value)} />
            </div>
            <div className="button-row">
              <button type="button" onClick={() => void onFetchBl2Release()} disabled={isLoadingBl2Release}>
                {t('fetchBl2Release')}
              </button>
            </div>
            <p className="hint">{t('releaseTag')}: {bl2ReleaseTag}</p>
            <div className="field-row">
              <label>{t('chooseBl2')}</label>
              <select
                className="candidate-select"
                value={selectedReleaseBl2Key}
                onChange={(event) => onSelectedReleaseBl2KeyChange(event.target.value)}
              >
                {releaseBl2Options.map((candidate) => (
                  <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                    {formatCandidateLabel(candidate)}
                  </option>
                ))}
              </select>
            </div>
            <div className="button-row">
              <button
                type="button"
                onClick={() => void onUseRemoteBl2ForExecution()}
                disabled={!canUseRemoteBl2ForExecution}
              >
                {t('useRemoteBl2ForRun')}
              </button>
            </div>
            {!selectedExecutionRemoteBl2Candidate && <p className="hint hint-warning">{t('remoteBl2NotSelectedForRun')}</p>}
            {selectedExecutionRemoteBl2Candidate && (
              <p className="hint">{t('remoteBl2InUse')}: {selectedExecutionRemoteBl2Candidate.fileName}</p>
            )}
            <div className="button-row">
              <button
                type="button"
                onClick={() => void onDownloadRambootPreloader()}
                disabled={!canDownloadRambootPreloader}
              >
                {t('downloadRambootPreloaderToLocal')}
              </button>
            </div>
            {!canDownloadRambootPreloader && <p className="hint hint-warning">{t('noSelectedBl2DownloadHint')}</p>}
            <p className="hint">{t('downloadUsesBrowserHint')}</p>
          </>
        )}

        {bl2Source === 'upload' && (
          <div className="field-row">
            <label>{t('uploadLocal')}</label>
            <input
              type="file"
              onChange={(event) => onUploadedBl2FileChange(event.target.files?.[0] ?? null)}
              accept=".bin,.img"
            />
          </div>
        )}

        <div className="button-row">
          <button type="button" onClick={() => void onRunBl2Md5Check()}>
            {t('verifyMd5')} (BL2)
          </button>
        </div>
        <p className="hint">{t('autoVerifyHint')}</p>
        <Md5Line
          expectedLabel={t('expectedMd5')}
          actualLabel={t('actualMd5')}
          expected={bl2ExpectedMd5}
          actual={bl2ActualMd5}
          passed={bl2Md5Passed}
        />
      </div>

      {loadMode === 'bl2-fip' && (
        <div>
          <h2>{t('fipSource')}</h2>
          <div className="field-row">
            <label>{t('fipSource')}</label>
            <select value={fipSource} onChange={(event) => onFipSourceChange(event.target.value as Exclude<FirmwareSource, 'builtin'>)}>
              <option value="github-release">{t('githubRelease')}</option>
              <option value="upload">{t('uploadLocal')}</option>
            </select>
          </div>

          {fipSource === 'github-release' && (
            <>
              <div className="field-row">
                <label>{t('fipReleaseApi')}</label>
                <input value={fipReleaseApi} onChange={(event) => onFipReleaseApiChange(event.target.value)} />
              </div>
              <div className="field-row">
                <label>{t('boardFilter')}</label>
                <input value={boardFilter} onChange={(event) => onBoardFilterChange(event.target.value)} placeholder={t('boardFilterPlaceholder')} />
              </div>
              <div className="button-row">
                <button type="button" onClick={() => void onFetchFipRelease()} disabled={isLoadingFipRelease}>
                  {t('fetchFipRelease')}
                </button>
              </div>
              <p className="hint">{t('releaseTag')}: {fipReleaseTag}</p>

              <div className="field-row">
                <label>{t('chooseFip')}</label>
                <select
                  className="candidate-select"
                  value={selectedReleaseFipKey}
                  onChange={(event) => onSelectedReleaseFipKeyChange(event.target.value)}
                >
                  {releaseFipOptions.map((candidate) => (
                    <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                      {formatCandidateLabel(candidate)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="button-row">
                <button
                  type="button"
                  onClick={() => void onUseRemoteFipForExecution()}
                  disabled={!canUseRemoteFipForExecution}
                >
                  {t('useRemoteFipForRun')}
                </button>
              </div>
              {!selectedExecutionRemoteFipCandidate && <p className="hint hint-warning">{t('remoteFipNotSelectedForRun')}</p>}
              {selectedExecutionRemoteFipCandidate && (
                <p className="hint">{t('remoteFipInUse')}: {selectedExecutionRemoteFipCandidate.fileName}</p>
              )}

              <div className="button-row">
                <button
                  type="button"
                  onClick={() => void onDownloadBoardBl2()}
                  disabled={!canDownloadBoardBl2}
                >
                  {t('downloadBl2ToLocal')}
                </button>
                <button
                  type="button"
                  onClick={() => void onDownloadFip()}
                  disabled={!canDownloadFip}
                >
                  {t('downloadFipToLocal')}
                </button>
              </div>
              {!canDownloadBoardBl2 && <p className="hint hint-warning">{t('noMatchedBoardBl2')}</p>}
              {!canDownloadFip && <p className="hint hint-warning">{t('noSelectedFipDownloadHint')}</p>}
              <p className="hint">{t('downloadUsesBrowserHint')}</p>
            </>
          )}

          {fipSource === 'upload' && (
            <div className="field-row">
              <label>{t('uploadLocal')}</label>
              <input
                type="file"
                onChange={(event) => onUploadedFipFileChange(event.target.files?.[0] ?? null)}
                accept=".bin,.img"
              />
            </div>
          )}

          <div className="button-row">
            <button type="button" onClick={() => void onRunFipMd5Check()}>
              {t('verifyMd5')} (FIP)
            </button>
          </div>
          <p className="hint">{t('autoVerifyHint')}</p>
          <Md5Line
            expectedLabel={t('expectedMd5')}
            actualLabel={t('actualMd5')}
            expected={fipExpectedMd5}
            actual={fipActualMd5}
            passed={fipMd5Passed}
          />
        </div>
      )}
    </section>
  )
}
