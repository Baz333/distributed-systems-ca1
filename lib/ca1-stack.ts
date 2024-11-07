import * as apig from "aws-cdk-lib/aws-apigateway";
import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { generateBatch } from "../shared/util";
import { albums } from "../seed/albums";

export class Ca1Stack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		//Table
		const albumsTable = new dynamodb.Table(this, "AlbumsTable", {
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			partitionKey: {name: "id", type: dynamodb.AttributeType.NUMBER},
			sortKey: {name: "artist", type: dynamodb.AttributeType.STRING},
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			tableName: "Albums",
		});

		//Seeding
		new custom.AwsCustomResource(this, "albumsddbInitData", {
			onCreate: {
				service: "DynamoDB",
				action: "batchWriteItem",
				parameters: {
					RequestItems: {
						[albumsTable.tableName]: generateBatch(albums),
					},
				},
				physicalResourceId: custom.PhysicalResourceId.of("albumsddbInitData")
			},
			policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
				resources: [albumsTable.tableArn],
			}),
		});

		//Functions
		const getAllAlbumsFn = new lambdanode.NodejsFunction(
			this,
			"GetAllAlbumsFn",
			{
				architecture: lambda.Architecture.ARM_64,
				runtime: lambda.Runtime.NODEJS_18_X,
				entry: `${__dirname}/../lambda/getAllAlbums.ts`,
				timeout: cdk.Duration.seconds(10),
				memorySize: 128,
				environment: {
					TABLE_NAME: albumsTable.tableName,
					REGION: 'eu-west-1',
				},
			}
		);

		const getAlbumByIdFn = new lambdanode.NodejsFunction(
			this,
			"GetAlbumByIdFn",
			{
				architecture: lambda.Architecture.ARM_64,
				runtime: lambda.Runtime.NODEJS_18_X,
				entry: `${__dirname}/../lambda/getAlbumById.ts`,
				timeout: cdk.Duration.seconds(10),
				memorySize: 128,
				environment: {
					TABLE_NAME: albumsTable.tableName,
					REGION: 'eu-west-1',
				},
			}
		);

		const addAlbumFn = new lambdanode.NodejsFunction(this, "AddAlbumFn", {
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.NODEJS_18_X,
			entry: `${__dirname}/../lambda/addAlbum.ts`,
			timeout: cdk.Duration.seconds(10),
			memorySize: 128,
			environment: {
				TABLE_NAME: albumsTable.tableName,
				REGION: "eu-west-1",
			},
		});

		const updateAlbumFn = new lambdanode.NodejsFunction(this, "UpdateAlbumFn", {
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.NODEJS_18_X,
			entry: `${__dirname}/../lambda/updateAlbum.ts`,
			timeout: cdk.Duration.seconds(10),
			memorySize: 128,
			environment: {
				TABLE_NAME: albumsTable.tableName,
				REGION: "eu-west-1",
			},
		});

		//Permissions
		albumsTable.grantReadData(getAllAlbumsFn)
		albumsTable.grantReadData(getAlbumByIdFn)
		albumsTable.grantReadWriteData(addAlbumFn)
		albumsTable.grantReadWriteData(updateAlbumFn)

		//REST API setup
		const api = new apig.RestApi(this, "RestAPI", {
			description: "CA1 API",
			deployOptions: {
				stageName: "dev",
			},
			defaultCorsPreflightOptions: {
				allowHeaders: ["Content-Type", "X-Amz-Date"],
				allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
				allowCredentials: true,
				allowOrigins: ["*"],
			},
		});

		//Endpoints
		const albumsEndpoint = api.root.addResource("albums");
		albumsEndpoint.addMethod(
			"GET",
			new apig.LambdaIntegration(getAllAlbumsFn, {proxy: true})
		);
		albumsEndpoint.addMethod(
			"POST",
			new apig.LambdaIntegration(addAlbumFn, {proxy: true})
		);

		const albumEndpoint = albumsEndpoint.addResource("{albumId}");
		albumEndpoint.addMethod(
			"GET",
			new apig.LambdaIntegration(getAlbumByIdFn, {proxy: true})
		);
		albumEndpoint.addMethod(
			"PUT",
			new apig.LambdaIntegration(updateAlbumFn, {proxy: true})
		);
	}
}