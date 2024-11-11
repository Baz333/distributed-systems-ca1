import { Aws } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam"
import { generateBatch } from "../shared/util";
import { albums } from "../seed/albums";

type AppApiProps = {
  userPoolId: string;
  userPoolClientId: string;
};

export class AppApi extends Construct {
	constructor(scope: Construct, id: string, props: AppApiProps) {
		super(scope, id);

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

		const appCommonFnProps = {
			architecture: lambda.Architecture.ARM_64,
			timeout: cdk.Duration.seconds(10),
			memorySize: 128,
			runtime: lambda.Runtime.NODEJS_16_X,
			handler: "handler",
			environment: {
				USER_POOL_ID: props.userPoolId,
				CLIENT_ID: props.userPoolClientId,
				REGION: cdk.Aws.REGION,
				TABLE_NAME: albumsTable.tableName,
			},
		};

		//Functions
		const getAllAlbumsFn = new lambdanode.NodejsFunction(
			this,
			"GetAllAlbumsFn",
			{
				...appCommonFnProps,
				entry: `${__dirname}/../lambda/getAllAlbums.ts`,
			}
		);

		const getAlbumByIdFn = new lambdanode.NodejsFunction(
			this,
			"GetAlbumByIdFn",
			{
				...appCommonFnProps,
				entry: `${__dirname}/../lambda/getAlbumById.ts`,
			}
		);

		const addAlbumFn = new lambdanode.NodejsFunction(this, "AddAlbumFn", {
			...appCommonFnProps,
			entry: `${__dirname}/../lambda/addAlbum.ts`,
		});

		const updateAlbumFn = new lambdanode.NodejsFunction(this, "UpdateAlbumFn", {
			...appCommonFnProps,
			entry: `${__dirname}/../lambda/updateAlbum.ts`,
		});

		const protectedFn = new node.NodejsFunction(this, "ProtectedFn", {
			...appCommonFnProps,
			entry: "./lambda/protected.ts",
		});

		const publicFn = new node.NodejsFunction(this, "PublicFn", {
			...appCommonFnProps,
			entry: "./lambda/public.ts",
		});

		const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
			...appCommonFnProps,
			entry: "./lambda/auth/authorizer.ts",
		});

		//Permissions
		albumsTable.grantReadData(getAllAlbumsFn)
		albumsTable.grantReadData(getAlbumByIdFn)
		albumsTable.grantReadWriteData(addAlbumFn)
		albumsTable.grantReadWriteData(updateAlbumFn)

		getAlbumByIdFn.addToRolePolicy(new iam.PolicyStatement({
			actions: ["translate:TranslateText"],
			resources: ["*"],
		}));

		//REST API setup
		// const api = new apig.RestApi(this, "RestAPI", {
		// 	description: "CA1 API",
		// 	deployOptions: {
		// 		stageName: "dev",
		// 	},
		// 	defaultCorsPreflightOptions: {
		// 		allowHeaders: ["Content-Type", "X-Amz-Date"],
		// 		allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
		// 		allowCredentials: true,
		// 		allowOrigins: ["*"],
		// 	},
		// });

		const appApi = new apig.RestApi(this, "AppApi", {
			description: "App RestApi",
			endpointTypes: [apig.EndpointType.REGIONAL],
			defaultCorsPreflightOptions: {
				allowOrigins: apig.Cors.ALL_ORIGINS,
			},
		});

		//Endpoints
		const albumsEndpoint = appApi.root.addResource("albums");
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

		const requestAuthorizer = new apig.RequestAuthorizer(
			this,
			"RequestAuthorizer",
			{
				identitySources: [apig.IdentitySource.header("cookie")],
				handler: authorizerFn,
				resultsCacheTtl: cdk.Duration.minutes(0),
			}
		);

		const protectedRes = appApi.root.addResource("protected");
		protectedRes.addMethod("GET", new apig.LambdaIntegration(protectedFn), {
			authorizer: requestAuthorizer,
			authorizationType: apig.AuthorizationType.CUSTOM,
		});

		const publicRes = appApi.root.addResource("public");
		publicRes.addMethod("GET", new apig.LambdaIntegration(publicFn));
	}
}