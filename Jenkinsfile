pipeline {
  agent any

  triggers {
    cron('0 8 * * *')
  }

  environment {
    CI = 'true'
  }

  stages {
    stage('Install') {
      steps {
        script {
          if (isUnix()) {
            sh 'npm ci'
            sh 'npx playwright install --with-deps chromium'
          } else {
            bat 'call npm.cmd ci'
            bat 'call npx.cmd playwright install chromium'
          }
        }
      }
    }

    stage('Daily Full Regression') {
      when {
        triggeredBy 'TimerTrigger'
      }
      steps {
        script {
          if (isUnix()) {
            sh 'npm run test:e2e'
          } else {
            bat 'call npm.cmd run test:e2e'
          }
        }
      }
    }

    stage('Docker Validation') {
      when {
        not {
          triggeredBy 'TimerTrigger'
        }
      }
      steps {
        script {
          if (isUnix()) {
            sh 'docker build -t ai-agentic-project-jenkins .'
          } else {
            bat 'docker build -t ai-agentic-project-jenkins .'
          }
        }
      }
    }

    stage('Change-Based Validation') {
      when {
        not {
          triggeredBy 'TimerTrigger'
        }
      }
      steps {
        script {
          def docOnlyFiles = [
            'README.md',
            'AGENTS.md'
          ] as Set
          def candidateRefs = [(env.PLAYWRIGHT_BASE_REF ?: '').trim(), 'origin/main', 'HEAD~1'].findAll { it }
          def baseRef = null

          for (candidate in candidateRefs) {
            def status = isUnix()
              ? sh(returnStatus: true, script: "git rev-parse --verify ${candidate}")
              : bat(returnStatus: true, script: "@git rev-parse --verify ${candidate}")

            if (status == 0) {
              baseRef = candidate
              break
            }
          }

          def changedFiles = []

          if (baseRef) {
            def diffCommand = baseRef == 'HEAD~1'
              ? 'git diff --name-only --diff-filter=ACMRT HEAD~1 HEAD'
              : "git diff --name-only --diff-filter=ACMRT ${baseRef}...HEAD"
            def rawChangedFiles = isUnix()
              ? sh(returnStdout: true, script: diffCommand).trim()
              : bat(returnStdout: true, script: "@${diffCommand}").trim()

            if (rawChangedFiles) {
              changedFiles = rawChangedFiles
                .readLines()
                .collect { it.trim().replace('\\', '/') }
                .findAll { it }
            }
          }

          def changedSpecFiles = changedFiles.findAll { it ==~ /tests\/e2e\/.*\.spec\.ts/ }
          def onlyDocsAndTestSpecsChanged = changedFiles &&
            changedFiles.every { filePath ->
              changedSpecFiles.contains(filePath) ||
                filePath.startsWith('docs/') ||
                docOnlyFiles.contains(filePath)
            }

          if (baseRef) {
            echo "Playwright diff base: ${baseRef}"
          } else {
            echo 'Playwright diff base was not available. Running the full suite.'
          }

          if (changedFiles) {
            echo "Changed files:\n- ${changedFiles.join('\n- ')}"
          }

          if (baseRef && changedSpecFiles && onlyDocsAndTestSpecsChanged) {
            echo 'Only Playwright spec files changed, so Jenkins will run the targeted spec set.'

            if (isUnix()) {
              sh "npx playwright test --only-changed=${baseRef}"
            } else {
              bat "call npx.cmd playwright test --only-changed=${baseRef}"
            }
          } else {
            echo 'Application, framework, config, or mixed changes detected. Running the full suite.'

            if (isUnix()) {
              sh 'npm run test:e2e'
            } else {
              bat 'call npm.cmd run test:e2e'
            }
          }
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: '.artifacts/**/*, test-results/**/*', allowEmptyArchive: true
    }
  }
}
