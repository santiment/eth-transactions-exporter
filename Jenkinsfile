podTemplate(label: 'xrp-transactions-exporter', containers: [
  containerTemplate(name: 'docker', image: 'docker', ttyEnabled: true, command: 'cat', envVars: [
    envVar(key: 'DOCKER_HOST', value: 'tcp://docker-host-docker-host:2375')
  ])
]) {
  node('xrp-transactions-exporter') {
    stage('Run Tests') {
      container('docker') {
        def scmVars = checkout scm
        withCredentials([
          string(
            credentialsId: 'aws_account_id',
            variable: 'aws_account_id'
          )
        ]) {
          def awsRegistry = "${env.aws_account_id}.dkr.ecr.eu-central-1.amazonaws.com"

          sh "docker build -t ${awsRegistry}/xrp-transactions-exporter:${env.BRANCH_NAME} -t ${awsRegistry}/xrp-transactions-exporter:${scmVars.GIT_COMMIT} ."

          if (env.BRANCH_NAME == "master") {
            docker.withRegistry("https://${awsRegistry}", "ecr:eu-central-1:ecr-credentials") {
              sh "docker push ${awsRegistry}/xrp-transactions-exporter:${env.BRANCH_NAME}"
              sh "docker push ${awsRegistry}/xrp-transactions-exporter:${scmVars.GIT_COMMIT}"
            }
          }
        }
      }
    }
  }
}
